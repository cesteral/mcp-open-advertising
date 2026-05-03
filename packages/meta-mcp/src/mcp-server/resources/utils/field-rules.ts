// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Ads field-rule constants.
 *
 * Single source of truth for the per-entity required-field rules and
 * read-only fields used by `meta_validate_entity`. The same tables back the
 * `meta-field-rules://{entityType}` MCP resource so clients can discover what
 * to send before invoking write tools.
 *
 * Meta Marketing API enum reference:
 *   https://developers.facebook.com/docs/marketing-api/
 */

import type { FieldRule } from "@cesteral/shared";
import type { MetaEntityType } from "../../tools/utils/entity-mapping.js";

export const CAMPAIGN_OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_APP_PROMOTION",
  "OUTCOME_SALES",
] as const;
export const STATUS_VALUES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] as const;
export const ADSET_OPTIMIZATION_GOALS = [
  "LINK_CLICKS",
  "IMPRESSIONS",
  "REACH",
  "POST_ENGAGEMENT",
  "OFFSITE_CONVERSIONS",
  "VALUE",
  "THRUPLAY",
] as const;
export const ADSET_BILLING_EVENTS = ["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY"] as const;
export const CUSTOM_AUDIENCE_SUBTYPES = [
  "CUSTOM",
  "LOOKALIKE",
  "WEBSITE",
  "APP",
  "ENGAGEMENT",
] as const;

export const REQUIRED_FIELDS_CREATE: Record<MetaEntityType, FieldRule[]> = {
  campaign: [
    { field: "name", expectedType: "string" },
    {
      field: "objective",
      expectedType: "string",
      hint: "e.g., OUTCOME_AWARENESS, OUTCOME_TRAFFIC",
      suggestedValues: CAMPAIGN_OBJECTIVES,
    },
    {
      field: "special_ad_categories",
      expectedType: "array",
      hint: "must be an array (can be empty [])",
    },
  ],
  adSet: [
    { field: "name", expectedType: "string" },
    { field: "campaign_id", expectedType: "string" },
    {
      field: "optimization_goal",
      expectedType: "string",
      hint: "e.g., LINK_CLICKS, IMPRESSIONS",
      suggestedValues: ADSET_OPTIMIZATION_GOALS,
    },
    {
      field: "billing_event",
      expectedType: "string",
      hint: "e.g., IMPRESSIONS, LINK_CLICKS",
      suggestedValues: ADSET_BILLING_EVENTS,
    },
    { field: "targeting", expectedType: "object", hint: "must be an object with targeting spec" },
    {
      field: "status",
      expectedType: "string",
      hint: "e.g., PAUSED, ACTIVE",
      suggestedValues: STATUS_VALUES,
    },
  ],
  ad: [
    { field: "name", expectedType: "string" },
    { field: "adset_id", expectedType: "string" },
    { field: "creative", expectedType: "object", hint: "must be an object with creative_id" },
    {
      field: "status",
      expectedType: "string",
      hint: "e.g., PAUSED, ACTIVE",
      suggestedValues: STATUS_VALUES,
    },
  ],
  adCreative: [{ field: "name", expectedType: "string" }],
  customAudience: [
    { field: "name", expectedType: "string" },
    {
      field: "subtype",
      expectedType: "string",
      hint: "e.g., CUSTOM, LOOKALIKE, WEBSITE",
      suggestedValues: CUSTOM_AUDIENCE_SUBTYPES,
    },
  ],
};

/** Fields that are always read-only and cannot be written via the API. */
export const READ_ONLY_FIELDS = [
  "id",
  "created_time",
  "updated_time",
  "time_created",
  "time_updated",
];

/** Fields whose values are in cents — warn if they look suspiciously low. */
export const BUDGET_FIELDS = ["daily_budget", "lifetime_budget", "bid_amount"];

/**
 * Bundle of rules for a single entity type, suitable for serializing as a
 * resource payload.
 */
export interface MetaEntityFieldRules {
  entityType: MetaEntityType;
  requiredOnCreate: FieldRule[];
  readOnlyFields: string[];
  budgetFields: string[];
}

export function getFieldRulesForEntity(entityType: MetaEntityType): MetaEntityFieldRules {
  return {
    entityType,
    requiredOnCreate: REQUIRED_FIELDS_CREATE[entityType] ?? [],
    readOnlyFields: READ_ONLY_FIELDS,
    budgetFields: BUDGET_FIELDS,
  };
}
