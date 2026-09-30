// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Microsoft Advertising field-rule constants.
 *
 * Single source of truth for the per-entity enum field rules used by
 * `msads_validate_entity`. The same tables back the
 * `msads-field-rules://{entityType}` MCP resource so clients can discover
 * what to send before invoking write tools.
 *
 * Microsoft Advertising REST API v13 enum reference:
 *   https://learn.microsoft.com/en-us/advertising/campaign-management-service/
 *
 * `msads_validate_entity` treats a value outside `suggestedValues` as an
 * error, so every list must be the complete documented enumeration. Each one is
 * the `xs:enumeration` list of the named simple type in the MicrosoftDocs/
 * Advertising source (`advertising/bingads-13/campaign-management-service/`):
 * CampaignStatus, BudgetLimitType, CampaignType, AdGroupStatus, Network,
 * AdStatus, AdType, MatchType, KeywordStatus. The shared Budget's BudgetType
 * is narrower: `budget.md` — "The only valid budget type that you can set is
 * DailyBudgetStandard".
 */

import type { FieldRule } from "@cesteral/shared";
import type { MsAdsEntityType } from "../../tools/utils/entity-mapping.js";

export const MSADS_ENUMS_BY_ENTITY: Partial<Record<MsAdsEntityType, FieldRule[]>> = {
  campaign: [
    {
      field: "Status",
      expectedType: "string",
      hint: "Campaign status",
      suggestedValues: [
        "Active",
        "Paused",
        "BudgetPaused",
        "BudgetAndManualPaused",
        "Deleted",
        "Suspended",
      ],
    },
    {
      field: "BudgetType",
      expectedType: "string",
      hint: "Budget type",
      suggestedValues: ["DailyBudgetStandard", "DailyBudgetAccelerated", "LifetimeBudgetStandard"],
    },
    {
      field: "CampaignType",
      expectedType: "string",
      hint: "Campaign type",
      suggestedValues: [
        "Search",
        "Shopping",
        "DynamicSearchAds",
        "Audience",
        "PerformanceMax",
        "Hotel",
        "App",
        "ObjectiveBased",
      ],
    },
  ],
  adGroup: [
    {
      field: "Status",
      expectedType: "string",
      suggestedValues: ["Active", "Paused", "Deleted", "Expired"],
    },
    {
      field: "Network",
      expectedType: "string",
      hint: "Distribution network",
      suggestedValues: [
        "OwnedAndOperatedAndSyndicatedSearch",
        "OwnedAndOperatedOnly",
        "SyndicatedSearchOnly",
        "InHousePromotion",
      ],
    },
  ],
  ad: [
    {
      field: "Status",
      expectedType: "string",
      suggestedValues: ["Active", "Paused", "Deleted", "Inactive"],
    },
    {
      field: "Type",
      expectedType: "string",
      suggestedValues: [
        "Text",
        "Image",
        "Product",
        "AppInstall",
        "ExpandedText",
        "DynamicSearch",
        "ResponsiveAd",
        "ResponsiveSearch",
        "Hotel",
      ],
    },
  ],
  keyword: [
    {
      field: "MatchType",
      expectedType: "string",
      hint: "Keyword match type",
      suggestedValues: ["Exact", "Phrase", "Broad"],
    },
    {
      field: "Status",
      expectedType: "string",
      suggestedValues: ["Active", "Paused", "Deleted", "Inactive"],
    },
  ],
  budget: [
    {
      field: "BudgetType",
      expectedType: "string",
      hint: "Shared budgets accept only DailyBudgetStandard",
      suggestedValues: ["DailyBudgetStandard"],
    },
  ],
};

/**
 * Bundle of rules for a single entity type, suitable for serializing as a
 * resource payload.
 */
export interface MsAdsEntityFieldRules {
  entityType: MsAdsEntityType;
  enumRules: FieldRule[];
}

export function getFieldRulesForEntity(entityType: MsAdsEntityType): MsAdsEntityFieldRules {
  return {
    entityType,
    enumRules: MSADS_ENUMS_BY_ENTITY[entityType] ?? [],
  };
}
