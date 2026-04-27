// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Entity Example Resources
 */
import type { Resource } from "../types.js";
import {
  getSupportedEntityTypes,
  getEntityConfig,
  type MetaEntityType,
} from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLES: Record<MetaEntityType, string> = {
  campaign: `# Campaign Examples

## Create a traffic campaign
\`\`\`json
{
  "name": "Summer Sale 2026 - Traffic",
  "objective": "OUTCOME_TRAFFIC",
  "status": "PAUSED",
  "special_ad_categories": [],
  "daily_budget": 5000,
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP"
}
\`\`\`

## Create a conversions campaign with CBO
\`\`\`json
{
  "name": "Q1 Conversions",
  "objective": "OUTCOME_SALES",
  "status": "PAUSED",
  "special_ad_categories": [],
  "daily_budget": 10000,
  "campaign_budget_optimization": true,
  "bid_strategy": "COST_CAP"
}
\`\`\``,

  adSet: `# Ad Set Examples

## Basic ad set with interest targeting
\`\`\`json
{
  "name": "US 25-44 Fitness Enthusiasts",
  "campaign_id": "CAMPAIGN_ID",
  "optimization_goal": "LINK_CLICKS",
  "billing_event": "IMPRESSIONS",
  "daily_budget": 5000,
  "targeting": {
    "age_min": 25,
    "age_max": 44,
    "geo_locations": { "countries": ["US"] },
    "interests": [{ "id": "6003139266461", "name": "Fitness and wellness" }],
    "targeting_automation": { "advantage_audience": 0 }
  },
  "status": "PAUSED"
}
\`\`\`

## Ad set with custom audience and frequency cap
\`\`\`json
{
  "name": "Retargeting - Website Visitors",
  "campaign_id": "CAMPAIGN_ID",
  "optimization_goal": "CONVERSIONS",
  "billing_event": "IMPRESSIONS",
  "daily_budget": 3000,
  "targeting": {
    "custom_audiences": [{ "id": "AUDIENCE_ID" }],
    "geo_locations": { "countries": ["US"] }
  },
  "frequency_control_specs": [{
    "event": "IMPRESSIONS",
    "interval_days": 7,
    "max_frequency": 3
  }],
  "status": "PAUSED"
}
\`\`\``,

  ad: `# Ad Examples

## Create an ad referencing an existing creative
\`\`\`json
{
  "name": "Summer Sale - Image Ad v1",
  "adset_id": "ADSET_ID",
  "creative": { "creative_id": "CREATIVE_ID" },
  "status": "PAUSED"
}
\`\`\``,

  adCreative: `# Ad Creative Examples

## Link ad creative
\`\`\`json
{
  "name": "Summer Sale Creative",
  "object_story_spec": {
    "page_id": "PAGE_ID",
    "link_data": {
      "link": "https://example.com/sale",
      "message": "Don't miss our Summer Sale!",
      "name": "Summer Sale - 50% Off",
      "description": "Shop now and save big.",
      "call_to_action": { "type": "SHOP_NOW" },
      "image_hash": "IMAGE_HASH"
    }
  }
}
\`\`\``,

  customAudience: `# Custom Audience Examples

## Website visitors audience
\`\`\`json
{
  "name": "Website Visitors - Last 30 Days",
  "subtype": "WEBSITE",
  "description": "People who visited our website in the last 30 days"
}
\`\`\`

## Lookalike audience
\`\`\`json
{
  "name": "Lookalike - Top Purchasers US 1%",
  "subtype": "LOOKALIKE",
  "lookalike_spec": {
    "origin": [{ "id": "SOURCE_AUDIENCE_ID", "type": "custom_audience" }],
    "country": "US",
    "ratio": 0.01
  }
}
\`\`\``,
};

export const entityExampleResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-examples://${entityType}`,
  name: `${getEntityConfig(entityType).displayName} Examples`,
  description: `Example payloads for Meta ${getEntityConfig(entityType).displayName} operations`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_EXAMPLES[entityType] || `# ${entityType}\n\nNo examples yet.`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://all",
  name: "All Meta Entity Examples",
  description: "Combined examples for all Meta Ads entity types",
  mimeType: "text/markdown",
  getContent: () =>
    getSupportedEntityTypes()
      .map((t) => ENTITY_EXAMPLES[t])
      .join("\n\n---\n\n"),
};
