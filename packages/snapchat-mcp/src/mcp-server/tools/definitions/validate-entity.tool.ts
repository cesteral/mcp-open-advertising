// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * snapchat_validate_entity — Client-side schema validation for Snapchat Ads entities.
 *
 * Snapchat Marketing API does not have a dry-run mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type SnapchatEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import {
  type FieldRule,
  validateRequiredFields,
  checkReadOnlyFields,
  validateEntityResponseFormatter,
} from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "snapchat_validate_entity";
const TOOL_TITLE = "Snapchat Ads Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known Snapchat Ads requirements without calling the API.

Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The Snapchat API may still reject payloads for business-rule
reasons (e.g., invalid objective/placement combinations).`;

// ---------------------------------------------------------------------------
// Required-field definitions per entity type (create mode)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS_CREATE: Record<SnapchatEntityType, FieldRule[]> = {
  campaign: [
    { field: "name", expectedType: "string" },
    { field: "status", expectedType: "string", hint: "ACTIVE or PAUSED" },
  ],
  adGroup: [
    { field: "campaign_id", expectedType: "string" },
    { field: "name", expectedType: "string" },
    { field: "status", expectedType: "string", hint: "ACTIVE or PAUSED" },
    { field: "type", expectedType: "string", hint: "e.g. SNAP_ADS" },
    { field: "placement", expectedType: "string", hint: "e.g. SNAP_ADS or CONTENT" },
    { field: "optimization_goal", expectedType: "string" },
    { field: "targeting", expectedType: "object" },
  ],
  ad: [
    { field: "ad_squad_id", expectedType: "string" },
    { field: "name", expectedType: "string" },
    { field: "creative_id", expectedType: "string" },
    { field: "type", expectedType: "string", hint: "e.g. SNAP_AD" },
    { field: "status", expectedType: "string", hint: "ACTIVE or PAUSED" },
  ],
  creative: [
    { field: "name", expectedType: "string" },
    { field: "type", expectedType: "string" },
  ],
};

/** Fields that are always read-only and cannot be set via the API. */
const READ_ONLY_FIELDS = [
  "created_at", "updated_at", "review_status", "delivery_status",
];

// ---------------------------------------------------------------------------
// Input / Output schemas
// ---------------------------------------------------------------------------

export const ValidateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Whether validating for creation or update"),
    data: z
      .record(z.any())
      .describe("Entity payload to validate"),
    adAccountId: z
      .string()
      .optional()
      .describe("Advertiser ID (recommended for create mode)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID required for adGroup updates"),
    adSquadId: z
      .string()
      .optional()
      .describe("Ad Squad ID required for ad updates"),
  })
  .describe("Parameters for validating a Snapchat Ads entity payload");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
    timestamp: z.string().datetime(),
  })
  .describe("Validation result");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

// ---------------------------------------------------------------------------
// Logic (pure — no API calls, no session services)
// ---------------------------------------------------------------------------

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const { entityType, mode, data } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (mode === "create") {
    const rules = REQUIRED_FIELDS_CREATE[entityType as SnapchatEntityType] ?? [];
    errors.push(...validateRequiredFields(data, rules));

    if (entityType === "campaign" && data.daily_budget_micro === undefined && data.lifetime_spend_cap_micro === undefined) {
      errors.push('Campaign create requires either "daily_budget_micro" or "lifetime_spend_cap_micro"');
    }
    if (entityType === "adGroup" && data.daily_budget_micro === undefined && data.lifetime_budget_micro === undefined) {
      errors.push('Ad group create requires either "daily_budget_micro" or "lifetime_budget_micro"');
    }
  }

  if (mode === "update") {
    if (Object.keys(data).length === 0) {
      errors.push("Update payload must contain at least one field to update");
    }
    if (entityType === "adGroup" && !input.campaignId) {
      errors.push("campaignId is required to route adGroup updates");
    }
    if (entityType === "ad" && !input.adSquadId) {
      errors.push("adSquadId is required to route ad updates");
    }

    warnings.push(
      ...checkReadOnlyFields(
        data,
        READ_ONLY_FIELDS,
        (field) => `Field "${field}" is a system field and may be ignored by the API on update`
      )
    );
  }

  // Budget warnings (both modes)
  for (const budgetField of ["daily_budget_micro", "lifetime_budget_micro", "lifetime_spend_cap_micro", "bid_micro"]) {
    const budgetValue = data[budgetField];
    if (budgetValue !== undefined && typeof budgetValue === "number" && budgetValue <= 0) {
      errors.push(`Field "${budgetField}" must be a positive number`);
    }
  }

  return {
    valid: errors.length === 0,
    entityType,
    mode,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tool definition (exported for allTools array)
// ---------------------------------------------------------------------------

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
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Valid campaign create",
      input: {
        entityType: "campaign",
        mode: "create",
        adAccountId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          objective: "WEB_CONVERSION",
          status: "ACTIVE",
          daily_budget_micro: 100000000,
        },
      },
    },
    {
      label: "Missing required fields (ad group)",
      input: {
        entityType: "adGroup",
        mode: "create",
        adAccountId: "1234567890",
        data: {
          name: "Test Ad Group",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
