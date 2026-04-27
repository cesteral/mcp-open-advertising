// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Entity Schema Resources
 *
 * Provides schema details for each entity type.
 */
import type { Resource } from "../types.js";
import {
  getSupportedEntityTypes,
  getEntityConfig,
  type MetaEntityType,
} from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMAS: Record<MetaEntityType, string> = {
  campaign: `# Campaign Schema

## Required Fields
- \`name\` (string) — Campaign name
- \`objective\` (string) — OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_APP_PROMOTION
- \`special_ad_categories\` (array) — Empty array [] if none, or ["EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS"]

## Optional Fields
- \`status\` (string) — ACTIVE, PAUSED (default: PAUSED)
- \`configured_status\` (string) — The status set by the advertiser (vs effective status)
- \`daily_budget\` (integer) — Daily budget in cents
- \`lifetime_budget\` (integer) — Lifetime budget in cents
- \`budget_remaining\` (string) — Remaining budget (read-only)
- \`bid_strategy\` (string) — LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP
- \`buying_type\` (string) — AUCTION (default), RESERVED
- \`campaign_budget_optimization\` (boolean) — Enable CBO
- \`special_ad_category_country\` (array) — Countries for special ad category enforcement
- \`start_time\` (string) — ISO 8601 datetime
- \`stop_time\` (string) — ISO 8601 datetime`,

  adSet: `# Ad Set Schema

## Required Fields
- \`name\` (string) — Ad set name
- \`campaign_id\` (string) — Parent campaign ID
- \`optimization_goal\` (string) — LINK_CLICKS, REACH, CONVERSIONS, APP_INSTALLS, VALUE, etc.
- \`billing_event\` (string) — IMPRESSIONS, LINK_CLICKS, etc.
- \`targeting\` (object) — Targeting specification
- \`status\` (string) — ACTIVE, PAUSED

## Optional Fields
- \`daily_budget\` (integer) — Budget in cents (if not using CBO)
- \`lifetime_budget\` (integer) — Lifetime budget in cents
- \`budget_remaining\` (string) — Remaining budget (read-only)
- \`bid_amount\` (integer) — Bid cap in cents
- \`bid_strategy\` (string) — LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP
- \`bid_constraints\` (object) — Bid constraints (e.g., roas_average_floor for MIN_ROAS)
- \`start_time\` (string) — ISO 8601 datetime
- \`end_time\` (string) — ISO 8601 datetime (required for lifetime budgets)
- \`frequency_control_specs\` (array) — Frequency capping rules [{event, interval_days, max_frequency}]
- \`is_dynamic_creative\` (boolean) — Enable dynamic creative testing
- \`destination_type\` (string) — WEBSITE, APP, MESSENGER, WHATSAPP, INSTAGRAM_DIRECT, etc.
- \`promoted_object\` (object) — Required for APP_INSTALLS (application_id, object_store_url)
- \`attribution_spec\` (array) — Attribution settings
- \`pacing_type\` (array) — Budget pacing ["standard"] or ["no_pacing"]
- \`dsa_beneficiary\` (string) — DSA compliance: beneficiary name (EU)
- \`dsa_payor\` (string) — DSA compliance: payor name (EU)

## Targeting Spec Structure
\`\`\`json
{
  "age_min": 18,
  "age_max": 65,
  "genders": [1, 2],
  "geo_locations": { "countries": ["US"] },
  "interests": [{ "id": "6003139266461", "name": "Fitness" }],
  "custom_audiences": [{ "id": "12345" }],
  "targeting_automation": { "advantage_audience": 0 }
}
\`\`\``,

  ad: `# Ad Schema

## Required Fields
- \`name\` (string) — Ad name
- \`adset_id\` (string) — Parent ad set ID
- \`creative\` (object) — Creative reference: \`{ "creative_id": "CREATIVE_ID" }\`
- \`status\` (string) — ACTIVE, PAUSED

## Optional Fields
- \`campaign_id\` (string) — Parent campaign ID (read-only, returned in responses)
- \`bid_amount\` (integer) — Override bid in cents
- \`tracking_specs\` (array) — Conversion tracking specs
- \`conversion_domain\` (string) — Domain for conversion tracking (iOS 14.5+)
- \`preview_shareable_link\` (string) — Shareable preview link (read-only)`,

  adCreative: `# Ad Creative Schema

## Required Fields
- \`name\` (string) — Creative name

## Common Fields
- \`object_story_spec\` (object) — Creative content specification
- \`object_type\` (string) — Type of creative object (read-only)
- \`body\` / \`message\` (string) — Ad body text
- \`title\` / \`headline\` (string) — Headline
- \`description\` (string) — Description text
- \`link_url\` (string) — Destination URL
- \`url_tags\` (string) — URL tags appended to all links
- \`image_hash\` (string) — Uploaded image hash
- \`call_to_action_type\` (string) — LEARN_MORE, SHOP_NOW, SIGN_UP, etc.
- \`instagram_actor_id\` (string) — Instagram account for placements
- \`product_set_id\` (string) — Product set for catalog/dynamic ads

## Dynamic Creative Fields
- \`asset_feed_spec\` (object) — Asset variations for dynamic creatives (images, videos, bodies, titles, descriptions, link_urls, ad_formats, call_to_action_types)
- \`dynamic_creative_spec\` (object) — Dynamic creative configuration
- \`degrees_of_freedom_spec\` (object) — Advantage+ creative optimization settings`,

  customAudience: `# Custom Audience Schema

## Required Fields
- \`name\` (string) — Audience name
- \`subtype\` (string) — CUSTOM, WEBSITE, APP, OFFLINE_CONVERSION, LOOKALIKE, etc.

## Optional Fields
- \`description\` (string) — Audience description
- \`customer_file_source\` (string) — Data source type
- \`lookalike_spec\` (object) — For lookalike audiences`,
};

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://${entityType}`,
  name: `${getEntityConfig(entityType).displayName} Schema`,
  description: `Field schema for Meta ${getEntityConfig(entityType).displayName} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_SCHEMAS[entityType] || `# ${entityType}\n\nSchema not yet documented.`,
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://all",
  name: "All Meta Entity Schemas",
  description: "Combined schema reference for all Meta Ads entity types",
  mimeType: "text/markdown",
  getContent: () =>
    getSupportedEntityTypes()
      .map((t) => ENTITY_SCHEMAS[t])
      .join("\n\n---\n\n"),
};
