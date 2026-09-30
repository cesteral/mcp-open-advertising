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
import { type FieldRule, createValidateEntityTool } from "@cesteral/shared";

const STATUS_VALUES = ["ACTIVE", "PAUSED"] as const;
const AD_SQUAD_TYPE_VALUES = ["SNAP_ADS", "LENS", "FILTER"] as const;
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
    {
      field: "objective_v2_properties",
      expectedType: "object",
      hint: 'e.g. { "objective_v2_type": "TRAFFIC" } — one of AWARENESS_AND_ENGAGEMENT, APP_PROMOTION, TRAFFIC, SALES',
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
      hint: "SNAP_ADS, LENS or FILTER",
      suggestedValues: AD_SQUAD_TYPE_VALUES,
    },
    {
      field: "placement_v2",
      expectedType: "object",
      hint: 'e.g. { "config": "AUTOMATIC", "platforms": ["SNAPCHAT"] }',
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

const READ_ONLY_FIELDS = ["created_at", "updated_at", "review_status", "delivery_status"];

const BUDGET_FIELDS = [
  "daily_budget_micro",
  "lifetime_budget_micro",
  "lifetime_spend_cap_micro",
  "bid_micro",
];

export const validateEntityTool = createValidateEntityTool<SnapchatEntityType>({
  toolName: "snapchat_validate_entity",
  toolTitle: "Snapchat Ads Entity Validation (Client-Side)",
  toolDescription: `Validate an entity payload against known Snapchat Ads requirements without calling the API.

Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The Snapchat API may still reject payloads for business-rule
reasons (e.g., a bid strategy that does not suit the optimization goal).

**Current Snap field names:** campaigns use \`objective_v2_properties\` (the legacy
\`objective\` is auto-translated by Snap, not rejected); ad squads use \`placement_v2\`
(the legacy \`placement\` attribute is rejected).`,
  entityTypeEnum: getEntityTypeEnum() as readonly [SnapchatEntityType, ...SnapchatEntityType[]],
  rulesByEntity: REQUIRED_FIELDS_CREATE,
  readOnlyFields: READ_ONLY_FIELDS,
  extraInputSchema: {
    adAccountId: z.string().optional().describe("Advertiser ID (recommended for create mode)"),
    campaignId: z.string().optional().describe("Campaign ID required for adGroup updates"),
    adSquadId: z.string().optional().describe("Ad Squad ID required for ad updates"),
  },
  extraValidate: ({ entityType, mode, data, extra, issues }) => {
    if (mode === "create") {
      if (entityType === "campaign" && data.objective !== undefined) {
        // Snap still accepts a campaign created with only the legacy objective
        // (its translator assigns objective_v2_properties), so a missing
        // objective_v2_properties must not fail validation when one is sent.
        // Both cases stay visible as a warning.
        const missingV2 = issues.find(
          (i) => i.field === "objective_v2_properties" && i.code === "missing"
        );
        if (missingV2) missingV2.severity = "warning";
        issues.push({
          field: "objective",
          code: "custom",
          message: missingV2
            ? 'Legacy "objective" is auto-translated by Snap, but it is legacy: send "objective_v2_properties" instead'
            : 'Legacy "objective" is auto-translated by Snap but should not be sent; use "objective_v2_properties" instead',
          severity: "warning",
        });
      }
      if (entityType === "adGroup" && data.placement !== undefined) {
        issues.push({
          field: "placement",
          code: "invalidValue",
          message:
            'Legacy "placement" is rejected by Snap; use "placement_v2" (e.g. { "config": "AUTOMATIC", "platforms": ["SNAPCHAT"] })',
          severity: "error",
        });
      }
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
          message:
            'Ad group create requires either "daily_budget_micro" or "lifetime_budget_micro"',
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
      if (entityType === "adGroup" && !extra.campaignId) {
        issues.push({
          field: "campaignId",
          code: "missing",
          message: "campaignId is required to route adGroup updates",
          severity: "error",
        });
      }
      if (entityType === "ad" && !extra.adSquadId) {
        issues.push({
          field: "adSquadId",
          code: "missing",
          message: "adSquadId is required to route ad updates",
          severity: "error",
        });
      }
    }

    for (const budgetField of BUDGET_FIELDS) {
      const budgetValue = data[budgetField];
      if (typeof budgetValue === "number" && budgetValue <= 0) {
        issues.push({
          field: budgetField,
          code: "invalidValue",
          message: `Field "${budgetField}" must be a positive number`,
          severity: "error",
        });
      }
    }

    const errorIssues = issues.filter((i) => i.severity !== "warning");
    if (errorIssues.length === 0) return;

    if (entityType === "adGroup" && errorIssues.some((i) => i.field === "campaign_id")) {
      return {
        nextAction:
          "Call snapchat_list_entities with entityType='campaign' to find a campaign_id for the parent campaign.",
      };
    }
    if (entityType === "ad" && errorIssues.some((i) => i.field === "ad_squad_id")) {
      return {
        nextAction:
          "Call snapchat_list_entities with entityType='adGroup' to find an ad_squad_id (ad squads are listed as adGroup entities).",
      };
    }
    if (errorIssues.some((i) => i.field === "ad_account_id")) {
      return {
        nextAction: "Call snapchat_list_ad_accounts to discover valid ad_account_id values.",
      };
    }
    return {
      nextAction: `Call snapchat_list_entities with entityType='${entityType}' to inspect existing examples.`,
    };
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
          objective_v2_properties: { objective_v2_type: "SALES" },
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
        data: { name: "Test Ad Group" },
      },
    },
  ],
});

export const ValidateEntityInputSchema = validateEntityTool.inputSchema;
export const ValidateEntityOutputSchema = validateEntityTool.outputSchema;
export const validateEntityLogic = validateEntityTool.logic;
