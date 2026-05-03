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
  type ValidationIssue,
  validateRequiredFieldsStructured,
  checkReadOnlyFieldsStructured,
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

const STATUS_VALUES = ["ACTIVE", "PAUSED"] as const;
const AD_SQUAD_TYPE_VALUES = ["SNAP_ADS"] as const;
const PLACEMENT_VALUES = ["SNAP_ADS", "CONTENT"] as const;
const AD_TYPE_VALUES = ["SNAP_AD"] as const;

const REQUIRED_FIELDS_CREATE: Record<SnapchatEntityType, FieldRule[]> = {
  campaign: [
    { field: "name", expectedType: "string" },
    {
      field: "status",
      expectedType: "string",
      hint: "ACTIVE or PAUSED",
      suggestedValues: STATUS_VALUES,
    },
  ],
  adGroup: [
    { field: "campaign_id", expectedType: "string" },
    { field: "name", expectedType: "string" },
    {
      field: "status",
      expectedType: "string",
      hint: "ACTIVE or PAUSED",
      suggestedValues: STATUS_VALUES,
    },
    {
      field: "type",
      expectedType: "string",
      hint: "e.g. SNAP_ADS",
      suggestedValues: AD_SQUAD_TYPE_VALUES,
    },
    {
      field: "placement",
      expectedType: "string",
      hint: "e.g. SNAP_ADS or CONTENT",
      suggestedValues: PLACEMENT_VALUES,
    },
    { field: "optimization_goal", expectedType: "string" },
    { field: "targeting", expectedType: "object" },
  ],
  ad: [
    { field: "ad_squad_id", expectedType: "string" },
    { field: "name", expectedType: "string" },
    { field: "creative_id", expectedType: "string" },
    {
      field: "type",
      expectedType: "string",
      hint: "e.g. SNAP_AD",
      suggestedValues: AD_TYPE_VALUES,
    },
    {
      field: "status",
      expectedType: "string",
      hint: "ACTIVE or PAUSED",
      suggestedValues: STATUS_VALUES,
    },
  ],
  creative: [
    { field: "name", expectedType: "string" },
    { field: "type", expectedType: "string" },
  ],
};

/** Fields that are always read-only and cannot be set via the API. */
const READ_ONLY_FIELDS = ["created_at", "updated_at", "review_status", "delivery_status"];

// ---------------------------------------------------------------------------
// Input / Output schemas
// ---------------------------------------------------------------------------

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to validate"),
    mode: z.enum(["create", "update"]).describe("Whether validating for creation or update"),
    data: z.record(z.any()).describe("Entity payload to validate"),
    adAccountId: z.string().optional().describe("Advertiser ID (recommended for create mode)"),
    campaignId: z.string().optional().describe("Campaign ID required for adGroup updates"),
    adSquadId: z.string().optional().describe("Ad Squad ID required for ad updates"),
  })
  .describe("Parameters for validating a Snapchat Ads entity payload");

const ValidationIssueSchema = z
  .object({
    field: z.string(),
    code: z.enum(["missing", "wrongType", "invalidValue", "readOnly", "custom"]),
    message: z.string(),
    hint: z.string().optional(),
    suggestedValues: z.array(z.string()).optional(),
    severity: z.enum(["error", "warning"]).optional(),
  })
  .describe("Structured validation issue");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()).describe("Flat error messages (mirrors issues with severity=error)"),
    warnings: z
      .array(z.string())
      .describe("Flat warning messages (mirrors issues with severity=warning)"),
    issues: z
      .array(ValidationIssueSchema)
      .describe("Structured per-field issues with hints and suggested values"),
    nextAction: z
      .string()
      .optional()
      .describe("One-line guidance on what to do next when validation fails"),
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
  const issues: ValidationIssue[] = [];

  if (mode === "create") {
    const rules = REQUIRED_FIELDS_CREATE[entityType as SnapchatEntityType] ?? [];
    issues.push(...validateRequiredFieldsStructured(data, rules));

    if (
      entityType === "campaign" &&
      data.daily_budget_micro === undefined &&
      data.lifetime_spend_cap_micro === undefined
    ) {
      issues.push({
        field: "daily_budget_micro",
        code: "missing",
        message:
          'Campaign create requires either "daily_budget_micro" or "lifetime_spend_cap_micro"',
        suggestedValues: ["daily_budget_micro", "lifetime_spend_cap_micro"],
        severity: "error",
      });
    }
    if (
      entityType === "adGroup" &&
      data.daily_budget_micro === undefined &&
      data.lifetime_budget_micro === undefined
    ) {
      issues.push({
        field: "daily_budget_micro",
        code: "missing",
        message: 'Ad group create requires either "daily_budget_micro" or "lifetime_budget_micro"',
        suggestedValues: ["daily_budget_micro", "lifetime_budget_micro"],
        severity: "error",
      });
    }
  }

  if (mode === "update") {
    if (Object.keys(data).length === 0) {
      issues.push({
        field: "data",
        code: "custom",
        message: "Update payload must contain at least one field to update",
        severity: "error",
      });
    }
    if (entityType === "adGroup" && !input.campaignId) {
      issues.push({
        field: "campaignId",
        code: "missing",
        message: "campaignId is required to route adGroup updates",
        severity: "error",
      });
    }
    if (entityType === "ad" && !input.adSquadId) {
      issues.push({
        field: "adSquadId",
        code: "missing",
        message: "adSquadId is required to route ad updates",
        severity: "error",
      });
    }

    issues.push(
      ...checkReadOnlyFieldsStructured(
        data,
        READ_ONLY_FIELDS,
        (field) => `Field "${field}" is a system field and may be ignored by the API on update`
      )
    );
  }

  // Budget validation (both modes)
  for (const budgetField of [
    "daily_budget_micro",
    "lifetime_budget_micro",
    "lifetime_spend_cap_micro",
    "bid_micro",
  ]) {
    const budgetValue = data[budgetField];
    if (budgetValue !== undefined && typeof budgetValue === "number" && budgetValue <= 0) {
      issues.push({
        field: budgetField,
        code: "invalidValue",
        message: `Field "${budgetField}" must be a positive number`,
        severity: "error",
      });
    }
  }

  const errorIssues = issues.filter((i) => i.severity !== "warning");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  let nextAction: string | undefined;
  if (errorIssues.length > 0) {
    if (entityType === "adGroup" && errorIssues.some((i) => i.field === "campaign_id")) {
      nextAction =
        "Call snapchat_list_entities with entityType='campaign' to find a campaign_id for the parent campaign.";
    } else if (entityType === "ad" && errorIssues.some((i) => i.field === "ad_squad_id")) {
      nextAction =
        "Call snapchat_list_entities with entityType='adGroup' to find an ad_squad_id (ad squads are listed as adGroup entities).";
    } else if (errorIssues.some((i) => i.field === "ad_account_id")) {
      nextAction = "Call snapchat_list_ad_accounts to discover valid ad_account_id values.";
    } else {
      nextAction = `Call snapchat_list_entities with entityType='${entityType}' to inspect existing examples.`;
    }
  }

  return {
    valid: errorIssues.length === 0,
    entityType,
    mode,
    errors: errorIssues.map((i) => i.message),
    warnings: warningIssues.map((i) => i.message),
    issues,
    ...(nextAction ? { nextAction } : {}),
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
