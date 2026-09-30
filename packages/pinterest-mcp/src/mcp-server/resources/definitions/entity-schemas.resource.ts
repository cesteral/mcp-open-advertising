// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Entity Schema Resources
 */
import type { Resource } from "../types.js";
import {
  getSupportedEntityTypes,
  type PinterestEntityType,
} from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMA_CONTENT: Record<PinterestEntityType, string> = {
  campaign: `# Pinterest Campaign Schema (v5)

Source: Pinterest Marketing API OpenAPI v5, \`CampaignCreateRequest\`. Selected fields only.

\`\`\`json
{
  "type": "object",
  "required": ["name", "objective_type"],
  "properties": {
    "name": { "type": "string" },
    "objective_type": {
      "type": "string",
      "enum": ["AWARENESS", "CONSIDERATION", "WEB_CONVERSION", "CATALOG_SALES", "VIDEO_COMPLETION", "SALES", "APP_INSTALL", "CTV_CONSIDERATION"],
      "description": "Can only be changed while the campaign is a draft"
    },
    "status": { "type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "DELETED_DRAFT"] },
    "daily_spend_cap": { "type": "integer", "description": "Micro-currency. Required with lifetime_spend_cap for CBO campaigns." },
    "lifetime_spend_cap": { "type": "integer", "description": "Micro-currency" },
    "is_campaign_budget_optimization": { "type": "boolean", "description": "Immutable unless the campaign is a draft" },
    "start_time": { "type": "integer", "description": "Unix seconds" },
    "end_time": { "type": "integer", "description": "Unix seconds" },
    "tracking_urls": { "type": "object" }
  }
}
\`\`\`

## Notes
- Money is **micro-currency**: 50.00/day is \`daily_spend_cap: 50000000\`.
- \`ad_account_id\` comes from the tool's \`adAccountId\`. The batch write items do not need it.
- Read-only fields: \`id\`, \`created_time\`, \`updated_time\`, \`summary_status\`
`,

  adGroup: `# Pinterest Ad Group Schema (v5)

Source: Pinterest Marketing API OpenAPI v5, \`AdGroupCreateRequest\`. Selected fields only.

\`\`\`json
{
  "type": "object",
  "required": ["name", "campaign_id", "billable_event"],
  "properties": {
    "name": { "type": "string" },
    "campaign_id": { "type": "string" },
    "billable_event": {
      "type": "string",
      "enum": ["CLICKTHROUGH", "IMPRESSION", "VIDEO_V_50_MRC"],
      "description": "Only a draft ad group can change it"
    },
    "status": { "type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "DELETED_DRAFT"] },
    "budget_in_micro_currency": { "type": "integer", "description": "Micro-currency. Required for non-CBO campaigns." },
    "budget_type": { "type": "string", "enum": ["DAILY", "LIFETIME", "CBO_ADGROUP"] },
    "bid_in_micro_currency": { "type": "integer", "description": "Micro-currency. Required for some objective and billable_event combinations." },
    "bid_strategy_type": { "type": "string", "enum": ["AUTOMATIC_BID", "MAX_BID", "TARGET_AVG"] },
    "pacing_delivery_type": { "type": "string", "enum": ["STANDARD", "ACCELERATED"] },
    "optimization_goal_metadata": { "type": "object", "description": "Required for some objective types" },
    "placement_group": { "type": "string", "enum": ["ALL", "SEARCH", "BROWSE", "OTHER"] },
    "auto_targeting_enabled": { "type": "boolean", "default": true },
    "targeting_spec": { "type": "object", "description": "UPPERCASE keys, see below" },
    "start_time": { "type": "integer", "description": "Unix seconds" },
    "end_time": { "type": "integer", "description": "Unix seconds" }
  }
}
\`\`\`

## targeting_spec keys (\`TargetingSpec\`)
| Key | Values |
|-----|--------|
| \`LOCATION\` / \`LOCATION_EXCLUDE\` | Metro codes or ISO-3166 alpha-2 country codes, e.g. \`["US"]\` |
| \`GEO\` / \`GEO_EXCLUDE\` | Region or postal codes |
| \`AGE_BUCKET\` | \`18-24\`, \`25-34\`, \`35-44\`, \`45-49\`, \`50-54\`, \`55-64\`, \`65+\` (legacy; \`MINIMUM_AGE\` + \`MAXIMUM_AGE\` are preferred) |
| \`MINIMUM_AGE\` / \`MAXIMUM_AGE\` | Strings \`"18"\` … \`"65"\`, or \`"65+"\` for maximum only. Use them together. |
| \`GENDER\` | \`unknown\`, \`male\`, \`female\` |
| \`INTEREST\` | Interest IDs (from \`pinterest_search_targeting\`) |
| \`LOCALE\` | ISO 639-1 language codes |
| \`APPTYPE\` | \`android_mobile\`, \`android_tablet\`, \`ipad\`, \`iphone\`, \`web\`, \`web_mobile\` |
| \`AUDIENCE_INCLUDE\` / \`AUDIENCE_EXCLUDE\` | Audience IDs |
| \`TARGETING_STRATEGY\` | \`CHOOSE_YOUR_OWN\`, \`FIND_NEW_CUSTOMERS\`, \`RECONNECT_WITH_USERS\` |

## Notes
- An update can replace \`targeting_spec\` or apply \`targeting_spec_operations\`.
- Read-only fields: \`id\`, \`created_time\`, \`updated_time\`, \`summary_status\`
`,

  ad: `# Pinterest Ad Schema (v5)

Source: Pinterest Marketing API OpenAPI v5, \`AdCreateRequest\`. Selected fields only.

\`\`\`json
{
  "type": "object",
  "required": ["ad_group_id", "creative_type", "pin_id"],
  "properties": {
    "ad_group_id": { "type": "string" },
    "creative_type": {
      "type": "string",
      "enum": ["REGULAR", "VIDEO", "SHOPPING", "CAROUSEL", "MAX_VIDEO", "SHOP_THE_PIN", "COLLECTION", "IDEA", "SHOWCASE", "QUIZ", "COLLAGE", "MAX_WIDTH_REGULAR_COLLECTION", "MAX_WIDTH_VIDEO_COLLECTION", "APP"],
      "description": "SHOP_THE_PIN is deprecated, use COLLECTION"
    },
    "pin_id": { "type": "string", "description": "Only a draft ad can change it" },
    "name": { "type": "string", "maxLength": 255 },
    "status": { "type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "DELETED_DRAFT"] },
    "destination_url": { "type": "string" },
    "customizable_cta_type": { "type": "string", "description": "e.g. LEARN_MORE, SHOP_NOW, SIGN_UP. Only for ads with direct links enabled." },
    "click_tracking_url": { "type": "string" },
    "view_tracking_url": { "type": "string" },
    "tracking_urls": { "type": "object" }
  }
}
\`\`\`

## Notes
- Create the Pin first. The ad only references it by \`pin_id\`.
- Use \`REGULAR\` for a standard image Pin and \`VIDEO\` for a standard video Pin.
- Read-only fields: \`id\`, \`created_time\`, \`updated_time\`, \`summary_status\`, \`review_status\`, \`rejected_reasons\`, \`rejection_labels\`
`,

  creative: `# Pinterest Creative (Pin) Schema (v5)

Source: Pinterest Marketing API OpenAPI v5, \`PinCreate\`. Selected fields only.

\`\`\`json
{
  "type": "object",
  "properties": {
    "board_id": { "type": "string" },
    "media_source": {
      "oneOf": [
        { "required": ["source_type", "url"], "properties": { "source_type": { "enum": ["image_url"] }, "url": { "type": "string" } } },
        { "required": ["source_type", "media_id"], "properties": { "source_type": { "enum": ["video_id"] }, "media_id": { "type": "string" }, "cover_image_url": { "type": "string" }, "cover_image_key_frame_time": { "type": "integer" } } }
      ],
      "description": "Other variants: image_base64, multiple_image_base64, multiple_image_urls, pin_url"
    },
    "title": { "type": "string", "maxLength": 100 },
    "description": { "type": "string", "maxLength": 800 },
    "link": { "type": "string", "maxLength": 2048 },
    "alt_text": { "type": "string", "maxLength": 500 },
    "board_section_id": { "type": "string" }
  }
}
\`\`\`

## Notes
- A Pin is the creative that an ad promotes. It belongs to a board on the user account.
- For a video Pin, upload the video with \`pinterest_upload_video\` and use the returned \`mediaId\` as \`media_id\`.
- A Pin is hard-deleted (\`DELETE /v5/pins/{pin_id}\`). It is not archived.
- Read-only fields: \`id\`, \`created_at\`, \`media\` (the processed media on a read)
`,
};

function buildEntitySchemaMarkdown(entityType: PinterestEntityType): string {
  return (
    ENTITY_SCHEMA_CONTENT[entityType] ??
    `# Pinterest ${entityType}\n\nNo schema information available.\n`
  );
}

function buildAllSchemasMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_SCHEMA_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://pinterest/${entityType}`,
  name: `Pinterest ${entityType} Schema`,
  description: `Field reference for Pinterest ${entityType} entity including required fields, optional fields, and read-only fields`,
  mimeType: "text/markdown",
  getContent: () => buildEntitySchemaMarkdown(entityType),
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://pinterest/all",
  name: "Pinterest All Entity Schemas",
  description: "Combined field reference for all Pinterest Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllSchemasMarkdown,
};
