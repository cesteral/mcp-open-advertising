/**
 * Pinterest Entity Example Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type PinterestEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLE_CONTENT: Record<PinterestEntityType, string> = {
  campaign: `# Pinterest Campaign Examples

## Create an Awareness Campaign (daily budget $50/day)
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "549755885175",
  "data": {
    "name": "Spring Sale Awareness",
    "objective_type": "AWARENESS",
    "status": "ACTIVE",
    "daily_spend_cap": 50000000
  }
}
\`\`\`

## Create a Conversions Campaign (lifetime budget)
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "549755885175",
  "data": {
    "name": "Q2 2026 Conversions",
    "objective_type": "CONVERSIONS",
    "status": "ACTIVE",
    "lifetime_spend_cap": 1000000000
  }
}
\`\`\`

## Pause a Campaign
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "549755885175",
  "entityId": "549755885175",
  "data": {
    "status": "PAUSED"
  }
}
\`\`\`

> **Budget note:** Pinterest uses micro-currency. $50/day = \`daily_spend_cap: 50000000\`
`,

  adGroup: `# Pinterest Ad Group Examples

## Create an Ad Group with Audience Targeting
\`\`\`json
{
  "entityType": "adGroup",
  "adAccountId": "549755885175",
  "data": {
    "name": "Women 25-34 US",
    "campaign_id": "549755885175",
    "status": "ACTIVE",
    "budget_in_micro_currency": 10000000,
    "pacing_delivery_type": "STANDARD",
    "bid_strategy_type": "AUTOMATIC_BID",
    "start_time": "2026-04-01T00:00:00",
    "targeting_spec": {
      "age_bucket": ["35-44", "45-49"],
      "gender": ["female"],
      "geo": [{ "country": "US" }],
      "interest": ["fashion", "beauty", "lifestyle"]
    }
  }
}
\`\`\`

## Create an Always-On Ad Group (no end time)
\`\`\`json
{
  "entityType": "adGroup",
  "adAccountId": "549755885175",
  "data": {
    "name": "Retargeting - Site Visitors",
    "campaign_id": "549755885175",
    "status": "ACTIVE",
    "budget_in_micro_currency": 5000000,
    "pacing_delivery_type": "STANDARD",
    "bid_strategy_type": "MAX_BID",
    "start_time": "2026-04-01T00:00:00"
  }
}
\`\`\`
`,

  ad: `# Pinterest Ad Examples

## Create a Regular (static image) Ad
\`\`\`json
{
  "entityType": "ad",
  "adAccountId": "549755885175",
  "data": {
    "name": "Spring Pin Ad",
    "ad_group_id": "2680060704746",
    "creative_type": "REGULAR",
    "pin_id": "1234567890",
    "status": "ACTIVE"
  }
}
\`\`\`

## Create a Video Ad
\`\`\`json
{
  "entityType": "ad",
  "adAccountId": "549755885175",
  "data": {
    "name": "Product Video Ad",
    "ad_group_id": "2680060704746",
    "creative_type": "VIDEO",
    "pin_id": "9876543210",
    "status": "ACTIVE"
  }
}
\`\`\`

> **Note:** Ads reference Pinterest Pins by pin_id. Create/upload the Pin before creating the Ad.
`,

  creative: `# Pinterest Creative (Pin) Examples

## Create an Image Creative
\`\`\`json
{
  "entityType": "creative",
  "adAccountId": "549755885175",
  "data": {
    "title": "Spring Sale - 50% Off",
    "description": "Shop our Spring Sale collection — up to 50% off select items",
    "link": "https://example.com/spring-sale",
    "media": {
      "source_type": "image_url",
      "url": "https://example.com/spring-banner.jpg"
    }
  }
}
\`\`\`

## Create a Video Creative
\`\`\`json
{
  "entityType": "creative",
  "adAccountId": "549755885175",
  "data": {
    "title": "New Collection Highlight",
    "description": "Discover our newest arrivals for the season",
    "link": "https://example.com/new-arrivals",
    "media": {
      "source_type": "video_url",
      "url": "https://example.com/product-video.mp4"
    }
  }
}
\`\`\`
`,
};

function buildAllExamplesMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_EXAMPLE_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entityExampleResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-examples://pinterest/${entityType}`,
  name: `Pinterest ${entityType} Examples`,
  description: `Example payloads for creating and updating Pinterest ${entityType} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_EXAMPLE_CONTENT[entityType] ?? `# Pinterest ${entityType} Examples\n\nNo examples available.\n`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://pinterest/all",
  name: "Pinterest All Entity Examples",
  description: "Combined example payloads for all Pinterest Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllExamplesMarkdown,
};
