// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type SA360EntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMAS: Record<SA360EntityType, string> = {
  customer: `# Customer Schema (Query Fields)

## Key Fields
- \`customer.id\` (string) — Customer ID
- \`customer.descriptive_name\` (string) — Account name
- \`customer.currency_code\` (string) — Account currency
- \`customer.time_zone\` (string) — Account timezone
- \`customer.manager\` (boolean) — Whether this is a manager account`,

  campaign: `# Campaign Schema (Query Fields)

## Key Fields
- \`campaign.id\` (string) — Campaign ID
- \`campaign.name\` (string) — Campaign name
- \`campaign.status\` (string) — ENABLED, PAUSED, REMOVED
- \`campaign.advertising_channel_type\` (string) — SEARCH, DISPLAY, SHOPPING, etc.
- \`campaign.bidding_strategy_type\` (string) — Bidding strategy type
- \`campaign.campaign_budget\` (string) — Budget resource name
- \`campaign.start_date\` (string) — Start date (YYYY-MM-DD)
- \`campaign.end_date\` (string) — End date (YYYY-MM-DD)

## Common Metrics
- \`metrics.impressions\`, \`metrics.clicks\`, \`metrics.cost_micros\`
- \`metrics.conversions\`, \`metrics.conversions_value\``,

  adGroup: `# Ad Group Schema (Query Fields)

## Key Fields
- \`ad_group.id\` (string) — Ad group ID
- \`ad_group.name\` (string) — Ad group name
- \`ad_group.status\` (string) — ENABLED, PAUSED, REMOVED
- \`ad_group.type\` (string) — SEARCH_STANDARD, DISPLAY_STANDARD, etc.
- \`ad_group.cpc_bid_micros\` (int64) — CPC bid in micros
- \`ad_group.campaign\` (string) — Parent campaign resource name`,

  adGroupAd: `# Ad Group Ad Schema (Query Fields)

## Key Fields
- \`ad_group_ad.ad.id\` (string) — Ad ID
- \`ad_group_ad.status\` (string) — ENABLED, PAUSED, REMOVED
- \`ad_group_ad.ad.type\` (string) — EXPANDED_TEXT_AD, RESPONSIVE_SEARCH_AD, etc.
- \`ad_group_ad.ad.final_urls\` (array) — Landing page URLs
- \`ad_group_ad.ad_group\` (string) — Parent ad group resource name`,

  adGroupCriterion: `# Ad Group Criterion Schema (Query Fields)

## Key Fields
- \`ad_group_criterion.criterion_id\` (string) — Criterion ID
- \`ad_group_criterion.status\` (string) — ENABLED, PAUSED, REMOVED
- \`ad_group_criterion.type\` (string) — KEYWORD, AUDIENCE, etc.
- \`ad_group_criterion.keyword.text\` (string) — Keyword text
- \`ad_group_criterion.keyword.match_type\` (string) — EXACT, PHRASE, BROAD
- \`ad_group_criterion.quality_info.quality_score\` (int) — Quality score (1-10)`,

  campaignCriterion: `# Campaign Criterion Schema (Query Fields)

## Key Fields
- \`campaign_criterion.criterion_id\` (string) — Criterion ID
- \`campaign_criterion.type\` (string) — LOCATION, LANGUAGE, etc.
- \`campaign_criterion.location.geo_target_constant\` (string) — Geo target
- \`campaign_criterion.language.language_constant\` (string) — Language
- \`campaign_criterion.negative\` (boolean) — Whether this is a negative criterion`,

  biddingStrategy: `# Bidding Strategy Schema (Query Fields)

## Key Fields
- \`bidding_strategy.id\` (string) — Strategy ID
- \`bidding_strategy.name\` (string) — Strategy name
- \`bidding_strategy.status\` (string) — ENABLED, REMOVED
- \`bidding_strategy.type\` (string) — TARGET_CPA, TARGET_ROAS, MAXIMIZE_CONVERSIONS, etc.
- \`bidding_strategy.campaign_count\` (int) — Number of campaigns using this strategy`,

  conversionAction: `# Conversion Action Schema (Query Fields)

## Key Fields
- \`conversion_action.id\` (string) — Conversion action ID
- \`conversion_action.name\` (string) — Conversion name
- \`conversion_action.status\` (string) — ENABLED, REMOVED, HIDDEN
- \`conversion_action.type\` (string) — AD_CALL, CLICK_TO_CALL, GOOGLE_PLAY_DOWNLOAD, etc.
- \`conversion_action.category\` (string) — DEFAULT, PAGE_VIEW, PURCHASE, SIGNUP, LEAD, etc.
- \`conversion_action.counting_type\` (string) — ONE_PER_CLICK, MANY_PER_CLICK`,
};

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://${entityType}`,
  name: `${entityType} Schema`,
  description: `Query field schema for SA360 ${entityType} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_SCHEMAS[entityType] || `# ${entityType}\n\nSchema not yet documented.`,
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://all",
  name: "All SA360 Entity Schemas",
  description: "Combined query field schemas for all SA360 entity types",
  mimeType: "text/markdown",
  getContent: () =>
    getSupportedEntityTypes()
      .map((t) => ENTITY_SCHEMAS[t])
      .join("\n\n---\n\n"),
};
