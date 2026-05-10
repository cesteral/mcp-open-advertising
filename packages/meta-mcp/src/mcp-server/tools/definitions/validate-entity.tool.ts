// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * meta_validate_entity — Client-side schema validation for Meta Ads entities.
 *
 * Meta Marketing API has no dry-run / validateOnly mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * Purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type MetaEntityType } from "../utils/entity-mapping.js";
import { createValidateEntityTool } from "@cesteral/shared";
import {
  REQUIRED_FIELDS_CREATE,
  READ_ONLY_FIELDS,
  BUDGET_FIELDS,
} from "../../resources/utils/field-rules.js";

export const validateEntityTool = createValidateEntityTool<MetaEntityType>({
  toolName: "meta_validate_entity",
  toolTitle: "Meta Ads Entity Validation (Client-Side)",
  toolDescription: `Validate an entity payload against known Meta Ads requirements without calling the API. Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it will catch missing required fields and
obvious type errors, but the Meta API may still reject payloads for
business-rule reasons (e.g., invalid objective/optimization_goal combinations).

Required-field tables, enum suggestions, and read-only field lists per entity type are also exposed as MCP resources. Valid values: see resource \`meta-field-rules://{entityType}\`.`,
  entityTypeEnum: getEntityTypeEnum() as readonly [MetaEntityType, ...MetaEntityType[]],
  rulesByEntity: REQUIRED_FIELDS_CREATE,
  readOnlyFields: READ_ONLY_FIELDS,
  extraInputSchema: {
    adAccountId: z.string().optional().describe("Ad Account ID (required for create mode)"),
  },
  extraValidate: ({ entityType, mode, data, extra, issues }) => {
    if (mode === "create" && !extra.adAccountId) {
      issues.push({
        field: "adAccountId",
        code: "missing",
        message: "adAccountId is required when mode is 'create'",
        severity: "error",
      });
    }

    if (
      mode === "create" &&
      entityType === "ad" &&
      data.creative &&
      typeof data.creative === "object" &&
      !Array.isArray(data.creative)
    ) {
      if (!(data.creative as Record<string, unknown>).creative_id) {
        issues.push({
          field: "creative.creative_id",
          code: "missing",
          message: 'Field "creative" object must contain "creative_id"',
          severity: "error",
        });
      }
    }

    for (const field of BUDGET_FIELDS) {
      const value = data[field];
      if (typeof value === "number" && value > 0 && value < 100) {
        issues.push({
          field,
          code: "invalidValue",
          message: `Field "${field}" is ${value} — budget values are in cents (e.g., 1000 = $10 USD). Did you mean ${value * 100}?`,
          severity: "warning",
        });
      }
    }

    const errorIssues = issues.filter((i) => i.severity !== "warning");
    if (errorIssues.length === 0) return;

    if (entityType === "adSet" && errorIssues.some((i) => i.field === "campaign_id")) {
      return {
        nextAction:
          "Call meta_list_entities with entityType='campaign' to find a campaign_id for the parent campaign.",
      };
    }
    if (entityType === "ad" && errorIssues.some((i) => i.field === "adset_id")) {
      return {
        nextAction:
          "Call meta_list_entities with entityType='adSet' to find an adset_id for the parent ad set.",
      };
    }
    if (mode === "create" && !extra.adAccountId) {
      return { nextAction: "Call meta_list_ad_accounts to discover available adAccountId values." };
    }
    return undefined;
  },
  inputExamples: [
    {
      label: "Valid campaign create",
      input: {
        entityType: "campaign",
        mode: "create",
        adAccountId: "123456789",
        data: {
          name: "Summer Sale 2025",
          objective: "OUTCOME_AWARENESS",
          special_ad_categories: [],
        },
      },
    },
    {
      label: "Missing required fields (ad set)",
      input: {
        entityType: "adSet",
        mode: "create",
        adAccountId: "123456789",
        data: { name: "Test Ad Set" },
      },
    },
  ],
});

export const ValidateEntityInputSchema = validateEntityTool.inputSchema;
export const ValidateEntityOutputSchema = validateEntityTool.outputSchema;
export const validateEntityLogic = validateEntityTool.logic;
