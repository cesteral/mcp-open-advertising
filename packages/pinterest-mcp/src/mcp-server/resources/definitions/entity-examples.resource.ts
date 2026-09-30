// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Entity Example Resources
 */
import type { Resource } from "../types.js";
import {
  getSupportedEntityTypes,
  type PinterestEntityType,
} from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLE_CONTENT: Record<PinterestEntityType, string> = {
  campaign: `# Pinterest Campaign Examples

These payloads go to \`pinterest_create_entity\` / \`pinterest_update_entity\`. Money is integer micro-currency and times are Unix seconds.

## Create an awareness campaign (50.00/day cap)
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "549755885175",
  "data": {
    "name": "Spring Sale Awareness",
    "objective_type": "AWARENESS",
    "status": "PAUSED",
    "daily_spend_cap": 50000000
  }
}
\`\`\`

## Create a conversion campaign (1,000.00 lifetime cap, scheduled)
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "549755885175",
  "data": {
    "name": "Q2 2026 Conversions",
    "objective_type": "WEB_CONVERSION",
    "status": "PAUSED",
    "lifetime_spend_cap": 1000000000,
    "start_time": 1775001600,
    "end_time": 1782863999
  }
}
\`\`\`

\`1775001600\` is 2026-04-01 00:00:00 UTC and \`1782863999\` is 2026-06-30 23:59:59 UTC.

## Pause a campaign
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "549755885175",
  "entityId": "626736533506",
  "data": { "status": "PAUSED" }
}
\`\`\`
`,

  adGroup: `# Pinterest Ad Group Examples

## Create an ad group with audience targeting
\`\`\`json
{
  "entityType": "adGroup",
  "adAccountId": "549755885175",
  "data": {
    "name": "Women 35-49 US",
    "campaign_id": "626736533506",
    "billable_event": "IMPRESSION",
    "status": "PAUSED",
    "budget_in_micro_currency": 10000000,
    "budget_type": "DAILY",
    "pacing_delivery_type": "STANDARD",
    "bid_strategy_type": "AUTOMATIC_BID",
    "start_time": 1775001600,
    "targeting_spec": {
      "LOCATION": ["US"],
      "AGE_BUCKET": ["35-44", "45-49"],
      "GENDER": ["female"],
      "INTEREST": ["{interest_id_from_pinterest_search_targeting}"]
    }
  }
}
\`\`\`

## Create an always-on ad group with a manual bid
\`\`\`json
{
  "entityType": "adGroup",
  "adAccountId": "549755885175",
  "data": {
    "name": "Retargeting - Site Visitors",
    "campaign_id": "626736533506",
    "billable_event": "CLICKTHROUGH",
    "status": "PAUSED",
    "budget_in_micro_currency": 5000000,
    "budget_type": "DAILY",
    "bid_strategy_type": "MAX_BID",
    "bid_in_micro_currency": 1500000,
    "start_time": 1775001600,
    "targeting_spec": { "AUDIENCE_INCLUDE": ["{audience_id}"] }
  }
}
\`\`\`

With no \`end_time\`, the ad group runs until it is paused or archived. Set \`status\` to \`ACTIVE\` once the ads are ready.
`,

  ad: `# Pinterest Ad Examples

An ad promotes an existing Pin. Create the Pin first (see the creative examples).

## Create a standard image ad
\`\`\`json
{
  "entityType": "ad",
  "adAccountId": "549755885175",
  "data": {
    "ad_group_id": "2680060704746",
    "creative_type": "REGULAR",
    "pin_id": "1234567890",
    "name": "Spring Pin Ad",
    "destination_url": "https://example.com/spring-sale",
    "status": "PAUSED"
  }
}
\`\`\`

## Create a video ad
\`\`\`json
{
  "entityType": "ad",
  "adAccountId": "549755885175",
  "data": {
    "ad_group_id": "2680060704746",
    "creative_type": "VIDEO",
    "pin_id": "9876543210",
    "name": "Product Video Ad",
    "status": "PAUSED"
  }
}
\`\`\`
`,

  creative: `# Pinterest Creative (Pin) Examples

A Pin is created on a board (\`board_id\`) and is then promoted by an ad through its \`id\`.

## Create an image Pin
\`\`\`json
{
  "entityType": "creative",
  "adAccountId": "549755885175",
  "data": {
    "board_id": "{board_id}",
    "title": "Spring Sale - 50% Off",
    "description": "Shop our Spring Sale collection — up to 50% off select items",
    "link": "https://example.com/spring-sale",
    "media_source": {
      "source_type": "image_url",
      "url": "https://example.com/spring-banner.jpg"
    }
  }
}
\`\`\`

## Create a video Pin
Upload the video first with \`pinterest_upload_video\`, then pass its \`mediaId\`:
\`\`\`json
{
  "entityType": "creative",
  "adAccountId": "549755885175",
  "data": {
    "board_id": "{board_id}",
    "title": "New Collection Highlight",
    "description": "Discover our newest arrivals for the season",
    "link": "https://example.com/new-arrivals",
    "media_source": {
      "source_type": "video_id",
      "media_id": "{mediaId_from_pinterest_upload_video}",
      "cover_image_url": "https://example.com/cover.jpg"
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
  getContent: () =>
    ENTITY_EXAMPLE_CONTENT[entityType] ??
    `# Pinterest ${entityType} Examples\n\nNo examples available.\n`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://pinterest/all",
  name: "Pinterest All Entity Examples",
  description: "Combined example payloads for all Pinterest Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllExamplesMarkdown,
};
