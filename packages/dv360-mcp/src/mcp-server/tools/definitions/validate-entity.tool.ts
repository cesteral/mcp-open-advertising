// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { getEntitySchemaByType, getFieldSchemaByPath } from "../utils/schema-introspection.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import {
  validateEntityResponseFormatter,
  buildNextAction,
  type ValidationIssue,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_validate_entity";
const TOOL_TITLE = "Validate DV360 Entity (Client-Side)";

function generateToolDescription(): string {
  const entityTypes = getSupportedEntityTypesDynamic().join(", ");
  return `Client-side validation of a DV360 entity payload against generated schemas. No API call is made.

**Supported entity types:** ${entityTypes}

**Modes:**
- **create**: Validates required fields are present
- **update**: Validates updateMask fields exist in data

Use \`entity-schema://{entityType}\` to inspect the full schema before constructing payloads.`;
}

const TOOL_DESCRIPTION = generateToolDescription();

const entityTypeEnum = getSupportedEntityTypesDynamic() as [string, ...string[]];

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(entityTypeEnum).describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Validation mode: 'create' for new entity, 'update' for existing"),
    data: z.record(z.any()).describe("Entity data payload to validate"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for create mode context)"),
    updateMask: z
      .string()
      .optional()
      .describe(
        "Comma-separated list of fields to update (required for update mode, e.g., 'entityStatus,displayName')"
      ),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "update" && !input.updateMask) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "updateMask is required when mode is 'update'",
        path: ["updateMask"],
      });
    }
    if (input.mode === "create" && !input.advertiserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "advertiserId is required when mode is 'create'",
        path: ["advertiserId"],
      });
    }
  })
  .describe("Parameters for validating a DV360 entity payload (client-side)");

const ValidationIssueSchema = z.object({
  field: z.string(),
  code: z.enum(["missing", "wrongType", "invalidValue", "readOnly", "custom"]),
  message: z.string(),
  hint: z.string().optional(),
  suggestedValues: z.array(z.string()).optional(),
  severity: z.enum(["error", "warning"]).optional(),
});

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string(),
    mode: z.string(),
    errors: z
      .array(z.string())
      .optional()
      .describe("Validation error messages (present when valid is false)"),
    warnings: z.array(z.string()).optional().describe("Non-fatal warnings"),
    issues: z
      .array(ValidationIssueSchema)
      .describe("Structured per-field issues with field path and Zod-mapped codes"),
    nextAction: z
      .string()
      .optional()
      .describe("One-line guidance for resolving validation failures."),
    timestamp: z.string().datetime(),
  })
  .describe("Entity validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

function mapZodIssueCode(zodCode: string): ValidationIssue["code"] {
  if (zodCode === "invalid_type") return "wrongType";
  if (zodCode === "invalid_enum_value" || zodCode === "invalid_literal") return "invalidValue";
  return "custom";
}

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const issues: ValidationIssue[] = [];

  // Get the Zod schema for this entity type
  const schema = getEntitySchemaByType(input.entityType);

  // For create mode, validate full payload against entity schema.
  if (input.mode === "create") {
    const parseResult = schema.safeParse(input.data);
    if (!parseResult.success) {
      for (const zodIssue of parseResult.error.issues) {
        const path = zodIssue.path.join(".");
        issues.push({
          field: path,
          code: mapZodIssueCode(zodIssue.code),
          message: `${path ? path + ": " : ""}${zodIssue.message}`,
          severity: "error",
        });
      }
    }
  }

  // For update mode, validate updateMask paths only (patch semantics).
  if (input.mode === "update" && input.updateMask) {
    const maskFields = Array.from(
      new Set(
        input.updateMask
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
      )
    );

    if (maskFields.length === 0) {
      issues.push({
        field: "updateMask",
        code: "missing",
        message: "updateMask must include at least one field path",
        severity: "error",
      });
    }

    for (const fieldPath of maskFields) {
      const fieldSchema = getFieldSchemaByPath(schema, fieldPath);
      if (!fieldSchema) {
        issues.push({
          field: fieldPath,
          code: "invalidValue",
          message: `Unknown updateMask field path: ${fieldPath}`,
          severity: "error",
        });
        continue;
      }

      const pathParts = fieldPath.split(".");
      let current: unknown = input.data;
      let hasValue = true;
      for (const part of pathParts) {
        if (
          current === null ||
          typeof current !== "object" ||
          !(part in (current as Record<string, unknown>))
        ) {
          hasValue = false;
          break;
        }
        current = (current as Record<string, unknown>)[part];
      }

      if (!hasValue) {
        issues.push({
          field: fieldPath,
          code: "missing",
          message: `updateMask field not found in data: ${fieldPath}`,
          severity: "error",
        });
        continue;
      }

      const fieldParse = fieldSchema.safeParse(current);
      if (!fieldParse.success) {
        for (const zodIssue of fieldParse.error.issues) {
          issues.push({
            field: fieldPath,
            code: mapZodIssueCode(zodIssue.code),
            message: `${fieldPath}: ${zodIssue.message}`,
            severity: "error",
          });
        }
      }
    }
  }

  const errorIssues = issues.filter((i) => i.severity !== "warning");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  let nextAction: string | undefined;
  if (errorIssues.length > 0) {
    const fieldHit = errorIssues.find((i) =>
      ["advertiserId", "campaignId", "insertionOrderId", "lineItemId"].includes(i.field)
    );
    if (fieldHit) {
      nextAction = buildNextAction({
        kind: "list-entity",
        tool: "dv360_list_entities",
        field: fieldHit.field,
      });
    } else {
      nextAction = buildNextAction({
        kind: "read-resource",
        uri: `entity-schema://${input.entityType}`,
        purpose: `the full ${input.entityType} field reference`,
      });
    }
  }

  return {
    valid: errorIssues.length === 0,
    entityType: input.entityType,
    mode: input.mode,
    errors: errorIssues.length > 0 ? errorIssues.map((i) => i.message) : undefined,
    warnings: warningIssues.length > 0 ? warningIssues.map((i) => i.message) : undefined,
    issues,
    ...(nextAction ? { nextAction } : {}),
    timestamp: new Date().toISOString(),
  };
}

export const validateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ValidateEntityInputSchema,
  outputSchema: ValidateEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [
    {
      label: "Validate a new campaign payload",
      input: {
        entityType: "campaign",
        mode: "create",
        advertiserId: "1234567",
        data: {
          displayName: "Q1 2025 Brand Campaign",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          campaignGoal: {
            campaignGoalType: "CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS",
          },
        },
      },
    },
    {
      label: "Validate a line item update",
      input: {
        entityType: "lineItem",
        mode: "update",
        updateMask: "entityStatus,bidStrategy.fixedBid.bidAmountMicros",
        data: {
          entityStatus: "ENTITY_STATUS_ACTIVE",
          bidStrategy: {
            fixedBid: { bidAmountMicros: "5000000" },
          },
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
