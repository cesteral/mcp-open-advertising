// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";

const TOOL_NAME = "cm360_validate_entity";
const TOOL_TITLE = "Validate CM360 Entity";
const TOOL_DESCRIPTION = `Dry-run validate a CM360 entity payload without making an API call.

Checks that the data object has the expected structure for the given entity type and mode (create or update). No credentials or profileId required.`;

export const ValidateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Validation mode — create checks for required fields, update checks for id presence"),
    data: z
      .record(z.any())
      .describe("Entity data to validate"),
  })
  .describe("Parameters for validating a CM360 entity");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the entity data is valid"),
    errors: z.array(z.string()).describe("Validation error messages"),
    warnings: z.array(z.string()).describe("Validation warnings"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext
): Promise<ValidateEntityOutput> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.mode === "update" && !input.data.id) {
    errors.push("id field is required for update mode (CM360 uses PUT semantics)");
  }

  if (input.mode === "create" && input.data.id) {
    warnings.push("id field is typically auto-generated on create — it will be ignored");
  }

  if (!input.data.name && ["campaign", "placement", "ad", "creative", "site", "floodlightActivity"].includes(input.entityType)) {
    warnings.push(`name field is typically required for ${input.entityType} entities`);
  }

  if (input.entityType === "campaign") {
    if (!input.data.advertiserId && input.mode === "create") {
      errors.push("advertiserId is required when creating a campaign");
    }
  }

  if (input.entityType === "placement") {
    if (!input.data.campaignId && input.mode === "create") {
      errors.push("campaignId is required when creating a placement");
    }
    if (!input.data.siteId && input.mode === "create") {
      warnings.push("siteId is typically required when creating a placement");
    }
  }

  if (input.entityType === "ad") {
    if (!input.data.campaignId && input.mode === "create") {
      errors.push("campaignId is required when creating an ad");
    }
  }

  if (input.entityType === "floodlightActivity") {
    if (!input.data.floodlightConfigurationId && input.mode === "create") {
      errors.push("floodlightConfigurationId is required when creating a floodlight activity");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export function validateEntityResponseFormatter(result: ValidateEntityOutput): McpTextContent[] {
  const status = result.valid ? "VALID" : "INVALID";
  const errorList = result.errors.length > 0
    ? `\n\nErrors:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`
    : "";
  const warningList = result.warnings.length > 0
    ? `\n\nWarnings:\n${result.warnings.map((w) => `  - ${w}`).join("\n")}`
    : "";

  return [
    {
      type: "text" as const,
      text: `Validation result: ${status}${errorList}${warningList}\n\nTimestamp: ${result.timestamp}`,
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