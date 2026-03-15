// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getEntityTypeEnum, getEntityConfig, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_validate_entity";
const TOOL_TITLE = "Validate Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Dry-run validate a Microsoft Advertising entity payload without making any API calls.

Checks that the entity type is valid and required fields are present. Does NOT call the Microsoft Ads API.`;

export const ValidateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Validation mode — create requires more fields than update"),
    data: z
      .record(z.unknown())
      .describe("Entity data payload to validate"),
  })
  .describe("Parameters for validating a Microsoft Ads entity");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean(),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    timestamp: z.string().datetime(),
  })
  .describe("Validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate entity type exists
  try {
    getEntityConfig(input.entityType as MsAdsEntityType);
  } catch {
    errors.push(`Unknown entity type: ${input.entityType}`);
  }

  // Check for data content
  if (!input.data || Object.keys(input.data).length === 0) {
    errors.push("Data payload is empty");
  }

  // For updates, check that Id is present
  if (input.mode === "update") {
    const config = getEntityConfig(input.entityType as MsAdsEntityType);
    const entities = input.data[config.pluralName] as Record<string, unknown>[] | undefined;
    if (entities && Array.isArray(entities)) {
      for (let i = 0; i < entities.length; i++) {
        if (!entities[i]![config.idField]) {
          errors.push(`Item ${i}: missing required field '${config.idField}' for update`);
        }
      }
    } else {
      warnings.push(`Expected data to contain '${config.pluralName}' array`);
    }
  }

  return {
    valid: errors.length === 0,
    entityType: input.entityType,
    mode: input.mode,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export function validateEntityResponseFormatter(result: ValidateEntityOutput): McpTextContent[] {
  const status = result.valid ? "VALID" : "INVALID";
  let text = `Validation ${status} for ${result.entityType} (${result.mode} mode)`;

  if (result.errors.length > 0) {
    text += `\n\nErrors:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`;
  }
  if (result.warnings.length > 0) {
    text += `\n\nWarnings:\n${result.warnings.map((w) => `  - ${w}`).join("\n")}`;
  }

  return [
    {
      type: "text" as const,
      text: `${text}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Validate a campaign for creation",
      input: {
        entityType: "campaign",
        mode: "create",
        data: {
          Campaigns: [{ Name: "Test", BudgetType: "DailyBudgetStandard" }],
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};