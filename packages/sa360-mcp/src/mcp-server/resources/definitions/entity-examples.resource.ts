// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type SA360EntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLES: Record<SA360EntityType, string> = {
  customer: `# Customer Query Examples

## List all accessible accounts
\`\`\`sql
SELECT customer.id, customer.descriptive_name, customer.currency_code
FROM customer
\`\`\``,

  campaign: `# Campaign Query Examples

## Active campaigns with metrics
\`\`\`sql
SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.cost_micros DESC
\`\`\`

## Campaign budget analysis
\`\`\`sql
SELECT campaign.name, campaign.campaign_budget, campaign.bidding_strategy_type, metrics.cost_micros
FROM campaign
WHERE segments.date DURING LAST_7_DAYS
\`\`\``,

  adGroup: `# Ad Group Query Examples

## Ad group performance
\`\`\`sql
SELECT ad_group.name, ad_group.status, ad_group.cpc_bid_micros, metrics.impressions, metrics.clicks, metrics.conversions
FROM ad_group
WHERE ad_group.status = 'ENABLED'
  AND segments.date DURING LAST_7_DAYS
ORDER BY metrics.clicks DESC
\`\`\``,

  adGroupAd: `# Ad Query Examples

## Ad performance
\`\`\`sql
SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, metrics.impressions, metrics.clicks, metrics.ctr
FROM ad_group_ad
WHERE ad_group_ad.status = 'ENABLED'
  AND segments.date DURING LAST_7_DAYS
\`\`\``,

  adGroupCriterion: `# Keyword Query Examples

## Top keywords by conversions
\`\`\`sql
SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
FROM ad_group_criterion
WHERE ad_group_criterion.type = 'KEYWORD'
  AND ad_group_criterion.status = 'ENABLED'
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.conversions DESC
LIMIT 50
\`\`\`

## Keywords with quality score
\`\`\`sql
SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, metrics.impressions
FROM ad_group_criterion
WHERE ad_group_criterion.type = 'KEYWORD'
ORDER BY ad_group_criterion.quality_info.quality_score ASC
\`\`\``,

  campaignCriterion: `# Campaign Criterion Query Examples

## Location targeting
\`\`\`sql
SELECT campaign.name, campaign_criterion.location.geo_target_constant, campaign_criterion.negative
FROM campaign_criterion
WHERE campaign_criterion.type = 'LOCATION'
\`\`\``,

  biddingStrategy: `# Bidding Strategy Query Examples

## List all portfolio bidding strategies
\`\`\`sql
SELECT bidding_strategy.name, bidding_strategy.type, bidding_strategy.status, bidding_strategy.campaign_count
FROM bidding_strategy
WHERE bidding_strategy.status = 'ENABLED'
\`\`\``,

  conversionAction: `# Conversion Action Query Examples

## List conversion actions
\`\`\`sql
SELECT conversion_action.name, conversion_action.type, conversion_action.status, conversion_action.category
FROM conversion_action
WHERE conversion_action.status = 'ENABLED'
\`\`\``,
};

export const entityExampleResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-examples://${entityType}`,
  name: `${entityType} Examples`,
  description: `Example SA360 queries for ${entityType} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_EXAMPLES[entityType] || `# ${entityType}\n\nNo examples yet.`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://all",
  name: "All SA360 Entity Examples",
  description: "Combined query examples for all SA360 entity types",
  mimeType: "text/markdown",
  getContent: () => getSupportedEntityTypes()
    .map((t) => ENTITY_EXAMPLES[t])
    .join("\n\n---\n\n"),
};