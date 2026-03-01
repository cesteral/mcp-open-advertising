import { z } from "zod";
import {
  getSupportedEntityTypesDynamic,
} from "../utils/entity-mapping-dynamic.js";
import {
  getEntitySchemaByType,
  extractRequiredFields,
} from "../utils/schema-introspection.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

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
    entityType: z
      .enum(entityTypeEnum)
      .describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Validation mode: 'create' for new entity, 'update' for existing"),
    data: z
      .record(z.any())
      .describe("Entity data payload to validate"),
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

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string(),
    mode: z.string(),
    errors: z
      .array(z.string())
      .optional()
      .describe("Validation error messages (present when valid is false)"),
    warnings: z
      .array(z.string())
      .optional()
      .describe("Non-fatal warnings"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get the Zod schema for this entity type
  const schema = getEntitySchemaByType(input.entityType);

  // Run schema validation via safeParse
  const parseResult = schema.safeParse(input.data);

  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      const path = issue.path.join(".");
      errors.push(`${path ? path + ": " : ""}${issue.message}`);
    }
  }

  // For create mode, check required fields
  if (input.mode === "create" && parseResult.success) {
    const requiredFields = extractRequiredFields(schema);
    const dataKeys = Object.keys(input.data);
    const missingRequired = requiredFields.filter(
      (f) => !f.includes(".") && !dataKeys.includes(f)
    );
    if (missingRequired.length > 0) {
      warnings.push(
        `Potentially missing required fields: ${missingRequired.join(", ")}`
      );
    }
  }

  // For update mode, validate updateMask fields exist in data
  if (input.mode === "update" && input.updateMask) {
    const maskFields = input.updateMask.split(",").map((f) => f.trim());
    const dataKeys = Object.keys(input.data);
    const missingInData = maskFields.filter((f) => {
      // Check top-level key (updateMask can be nested like "bidStrategy.fixedBid")
      const topLevel = f.split(".")[0];
      return !dataKeys.includes(topLevel);
    });
    if (missingInData.length > 0) {
      errors.push(
        `updateMask fields not found in data: ${missingInData.join(", ")}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    entityType: input.entityType,
    mode: input.mode,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    timestamp: new Date().toISOString(),
  };
}

export function validateEntityResponseFormatter(
  result: ValidateEntityOutput
): any {
  const parts: string[] = [];

  if (result.valid) {
    parts.push(
      `Validation passed for ${result.entityType} (${result.mode})`
    );
  } else {
    parts.push(
      `Validation failed for ${result.entityType} (${result.mode})`
    );
    if (result.errors) {
      parts.push(`\nErrors:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
    }
  }

  if (result.warnings && result.warnings.length > 0) {
    parts.push(`\nWarnings:\n${result.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }

  parts.push(`\nTimestamp: ${result.timestamp}`);

  return [
    {
      type: "text" as const,
      text: parts.join("\n"),
    },
  ];
}

export const validateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ValidateEntityInputSchema,
  outputSchema: ValidateEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
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
