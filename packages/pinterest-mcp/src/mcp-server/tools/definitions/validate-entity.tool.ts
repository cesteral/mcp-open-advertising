// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * pinterest_validate_entity — Client-side schema validation for Pinterest Ads entities.
 *
 * Pinterest Marketing API does not have a dry-run mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import {
  type FieldRule,
  createValidateEntityTool,
  buildNextAction,
} from "@cesteral/shared";

const REQUIRED_FIELDS_CREATE: Record<PinterestEntityType, FieldRule[]> = {
  campaign: [
    { field: "campaign_name", expectedType: "string" },
    {
      field: "objective_type",
      expectedType: "string",
      hint: "e.g., TRAFFIC, APP_INSTALLS, CONVERSIONS",
    },
    { field: "budget_mode", expectedType: "string", hint: "BUDGET_MODE_DAY or BUDGET_MODE_TOTAL" },
    { field: "budget", expectedType: "number", hint: "budget amount in account currency" },
  ],
  adGroup: [
    { field: "campaign_id", expectedType: "string" },
    { field: "adgroup_name", expectedType: "string" },
    {
      field: "placement_type",
      expectedType: "string",
      hint: "e.g., PLACEMENT_TYPE_NORMAL, PLACEMENT_TYPE_SEARCH",
    },
    { field: "budget_mode", expectedType: "string", hint: "BUDGET_MODE_DAY or BUDGET_MODE_TOTAL" },
    { field: "budget", expectedType: "number" },
    {
      field: "schedule_type",
      expectedType: "string",
      hint: "SCHEDULE_START_END or SCHEDULE_ALWAYS",
    },
    { field: "optimize_goal", expectedType: "string", hint: "e.g., CLICK, CONVERT, SHOW, REACH" },
  ],
  ad: [
    { field: "adgroup_id", expectedType: "string" },
    { field: "ad_name", expectedType: "string" },
    {
      field: "creative_type",
      expectedType: "string",
      hint: "e.g., SINGLE_VIDEO, SINGLE_IMAGE, CAROUSEL",
    },
  ],
  creative: [{ field: "display_name", expectedType: "string" }],
};

const READ_ONLY_FIELDS = [
  "campaign_id",
  "adgroup_id",
  "ad_id",
  "creative_id",
  "created_time",
  "modify_time",
];

export const validateEntityTool = createValidateEntityTool<PinterestEntityType>({
  toolName: "pinterest_validate_entity",
  toolTitle: "Pinterest Ads Entity Validation (Client-Side)",
  toolDescription: `Validate an entity payload against known Pinterest Ads requirements without calling the API.

Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The Pinterest API may still reject payloads for business-rule
reasons (e.g., invalid objective/placement combinations).`,
  entityTypeEnum: getEntityTypeEnum() as readonly [PinterestEntityType, ...PinterestEntityType[]],
  rulesByEntity: REQUIRED_FIELDS_CREATE,
  readOnlyFields: READ_ONLY_FIELDS,
  extraInputSchema: {
    adAccountId: z.string().optional().describe("Advertiser ID (recommended for create mode)"),
  },
  extraValidate: ({ entityType, mode, data, issues }) => {
    if (mode === "create" && entityType === "ad") {
      if (!data.image_ids && !data.video_id) {
        issues.push({
          field: "image_ids",
          code: "missing",
          message: 'Ad creative requires either "image_ids" (array) or "video_id" (string)',
          suggestedValues: ["image_ids", "video_id"],
          severity: "warning",
        });
      }
    }

    if (mode === "update" && Object.keys(data).length === 0) {
      issues.push({
        field: "data",
        code: "custom",
        message: "Update payload must contain at least one field to update",
        severity: "error",
      });
    }

    const budgetValue = data.budget;
    if (typeof budgetValue === "number" && budgetValue <= 0) {
      issues.push({
        field: "budget",
        code: "invalidValue",
        message: 'Field "budget" must be a positive number',
        severity: "error",
      });
    }

    const errorIssues = issues.filter((i) => i.severity !== "warning");
    if (errorIssues.length === 0) return;

    if (errorIssues.some((i) => i.field === "ad_account_id")) {
      return {
        nextAction: buildNextAction({
          kind: "discover-account",
          tool: "pinterest_list_ad_accounts",
          field: "ad_account_id",
        }),
      };
    }
    const parentField = errorIssues.find((i) => ["campaign_id", "ad_group_id"].includes(i.field));
    return {
      nextAction: parentField
        ? buildNextAction({
            kind: "list-entity",
            tool: "pinterest_list_entities",
            field: parentField.field,
          })
        : buildNextAction({
            kind: "list-entity",
            tool: "pinterest_list_entities",
            entityType,
          }),
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
          campaign_name: "Summer Sale 2026",
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 100,
        },
      },
    },
    {
      label: "Missing required fields (ad group)",
      input: {
        entityType: "adGroup",
        mode: "create",
        adAccountId: "1234567890",
        data: { adgroup_name: "Test Ad Group" },
      },
    },
  ],
});

export const ValidateEntityInputSchema = validateEntityTool.inputSchema;
export const ValidateEntityOutputSchema = validateEntityTool.outputSchema;
export const validateEntityLogic = validateEntityTool.logic;
