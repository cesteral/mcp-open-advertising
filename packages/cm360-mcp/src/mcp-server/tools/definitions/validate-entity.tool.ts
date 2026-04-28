// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import { validateEntityResponseFormatter, type ValidationIssue } from "@cesteral/shared";

const TOOL_NAME = "cm360_validate_entity";
const TOOL_TITLE = "Validate CM360 Entity";
const TOOL_DESCRIPTION = `Dry-run validate a CM360 entity payload without making an API call.

Checks that the data object has the expected structure for the given entity type and mode (create or update). No credentials or profileId required.`;

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe(
        "Validation mode — create checks for required fields, update checks for id presence"
      ),
    data: z.record(z.any()).describe("Entity data to validate"),
  })
  .describe("Parameters for validating a CM360 entity");

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
    valid: z.boolean().describe("Whether the entity data is valid"),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()).describe("Validation error messages"),
    warnings: z.array(z.string()).describe("Validation warnings"),
    issues: z.array(ValidationIssueSchema),
    nextAction: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext
): Promise<ValidateEntityOutput> {
  const issues: ValidationIssue[] = [];
  const err = (field: string, code: ValidationIssue["code"], message: string) =>
    issues.push({ field, code, message, severity: "error" });
  const warn = (field: string, code: ValidationIssue["code"], message: string) =>
    issues.push({ field, code, message, severity: "warning" });

  if (input.mode === "update" && !input.data.id) {
    err("id", "missing", "id field is required for update mode (CM360 uses PUT semantics)");
  }

  if (input.mode === "create" && input.data.id) {
    warn("id", "readOnly", "id field is typically auto-generated on create — it will be ignored");
  }

  if (
    !input.data.name &&
    ["campaign", "placement", "ad", "creative", "site", "floodlightActivity"].includes(
      input.entityType
    )
  ) {
    warn("name", "missing", `name field is typically required for ${input.entityType} entities`);
  }

  if (input.entityType === "campaign") {
    if (!input.data.advertiserId && input.mode === "create") {
      err("advertiserId", "missing", "advertiserId is required when creating a campaign");
    }
  }

  if (input.entityType === "placement") {
    if (!input.data.campaignId && input.mode === "create") {
      err("campaignId", "missing", "campaignId is required when creating a placement");
    }
    if (!input.data.siteId && input.mode === "create") {
      warn("siteId", "missing", "siteId is typically required when creating a placement");
    }
  }

  if (input.entityType === "ad") {
    if (!input.data.campaignId && input.mode === "create") {
      err("campaignId", "missing", "campaignId is required when creating an ad");
    }
  }

  if (input.entityType === "floodlightActivity") {
    if (!input.data.floodlightConfigurationId && input.mode === "create") {
      err(
        "floodlightConfigurationId",
        "missing",
        "floodlightConfigurationId is required when creating a floodlight activity"
      );
    }
  }

  const errorIssues = issues.filter((i) => i.severity !== "warning");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  return {
    valid: errorIssues.length === 0,
    entityType: input.entityType,
    mode: input.mode,
    errors: errorIssues.map((i) => i.message),
    warnings: warningIssues.map((i) => i.message),
    issues,
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
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Validate a campaign for creation",
      input: {
        entityType: "campaign",
        mode: "create",
        data: {
          name: "Q1 Brand Campaign",
          advertiserId: "789012",
        },
      },
    },
    {
      label: "Validate entity for update",
      input: {
        entityType: "placement",
        mode: "update",
        data: {
          id: "111222",
          name: "Updated Placement",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
