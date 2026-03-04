/**
 * TikTok Entity Schema Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type TikTokEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMA_CONTENT: Record<TikTokEntityType, string> = {
  campaign: `# TikTok Campaign Fields

## Required Fields (create)
| Field | Type | Description |
|-------|------|-------------|
| campaign_name | string | Campaign display name (max 512 chars) |
| objective_type | string | Campaign objective: TRAFFIC, APP_INSTALLS, CONVERSIONS, AWARENESS, VIDEO_VIEWS, LEAD_GENERATION, CATALOG_SALES, COMMUNITY_INTERACTION |
| budget_mode | string | BUDGET_MODE_DAY (daily) or BUDGET_MODE_TOTAL (lifetime) |
| budget | number | Budget in account currency |

## Optional Fields
| Field | Type | Description |
|-------|------|-------------|
| status | string | CAMPAIGN_STATUS_ENABLE or CAMPAIGN_STATUS_DISABLE (default: CAMPAIGN_STATUS_ENABLE) |
| roas_bid | number | Target ROAS (for ROAS optimization) |
| is_smart_performance_campaign | boolean | Enable smart performance campaign |
| app_promotion_type | string | DOWNLOAD_FROM_MARKET or OPEN_URL (for app objectives) |

## Read-Only Fields
campaign_id, created_time, modify_time, advertiser_id
`,

  adGroup: `# TikTok Ad Group Fields

## Required Fields (create)
| Field | Type | Description |
|-------|------|-------------|
| campaign_id | string | Parent campaign ID |
| adgroup_name | string | Ad group display name |
| placement_type | string | PLACEMENT_TYPE_NORMAL (auto-placement) or PLACEMENT_TYPE_SEARCH |
| budget_mode | string | BUDGET_MODE_DAY or BUDGET_MODE_TOTAL |
| budget | number | Budget in account currency |
| schedule_type | string | SCHEDULE_START_END or SCHEDULE_ALWAYS |
| optimize_goal | string | CLICK, CONVERT, SHOW, REACH, VIDEO_VIEW, LEAD, APP_INSTALL |

## Optional Fields
| Field | Type | Description |
|-------|------|-------------|
| schedule_start_time | string | Start time (YYYY-MM-DD HH:mm:ss) — required if schedule_type=SCHEDULE_START_END |
| schedule_end_time | string | End time (YYYY-MM-DD HH:mm:ss) |
| bid_price | number | Bid price in account currency |
| bid_type | string | BID_TYPE_NO_BID, BID_TYPE_CUSTOM, BID_TYPE_MAX_CONVERSION |
| age | array | Age ranges: AGE_13_17, AGE_18_24, AGE_25_34, AGE_35_44, AGE_45_54, AGE_55_100 |
| gender | array | GENDER_UNLIMITED, GENDER_MALE, GENDER_FEMALE |
| location_ids | array | Array of location IDs (country codes or region IDs) |
| interest_category_ids | array | Interest category IDs |
| languages | array | Language codes (e.g., ["en", "zh"]) |
| placements | array | Specific placement IDs |
| device_platforms | array | DESKTOP or MOBILE |
| operating_systems | array | IOS or ANDROID |

## Read-Only Fields
adgroup_id, campaign_id (inherited), created_time, modify_time
`,

  ad: `# TikTok Ad Fields

## Required Fields (create)
| Field | Type | Description |
|-------|------|-------------|
| adgroup_id | string | Parent ad group ID |
| ad_name | string | Ad display name |
| creative_type | string | SINGLE_VIDEO, SINGLE_IMAGE, CAROUSEL |

## Creative Fields (one required)
| Field | Type | Description |
|-------|------|-------------|
| video_id | string | Video ID from TikTok Creative Library |
| image_ids | array | Array of image IDs (for image/carousel ads) |

## Optional Creative Fields
| Field | Type | Description |
|-------|------|-------------|
| ad_text | string | Ad copy text (max 100 chars) |
| app_name | string | App name shown in the ad |
| landing_page_url | string | Destination URL |
| display_name | string | Display brand name |
| profile_image_url | string | Brand profile image URL |
| call_to_action | string | CTA text: LEARN_MORE, SHOP_NOW, DOWNLOAD, SIGN_UP, etc. |
| status | string | AD_STATUS_ENABLE or AD_STATUS_DISABLE |

## Read-Only Fields
ad_id, adgroup_id (inherited), created_time, modify_time
`,

  creative: `# TikTok Creative Fields

## Required Fields (create)
| Field | Type | Description |
|-------|------|-------------|
| display_name | string | Creative display name |

## Creative Asset Fields (provide at least one)
| Field | Type | Description |
|-------|------|-------------|
| video_id | string | Video asset ID from Creative Library |
| image_ids | array | Array of image asset IDs |

## Optional Fields
| Field | Type | Description |
|-------|------|-------------|
| ad_text | string | Ad copy text |
| call_to_action | string | CTA: LEARN_MORE, SHOP_NOW, DOWNLOAD, etc. |
| landing_page_url | string | Destination URL |
| profile_image_url | string | Brand profile image |
| app_name | string | App name for app install ads |

## Read-Only Fields
creative_id, advertiser_id, created_time
`,
};

function buildEntitySchemaMarkdown(entityType: TikTokEntityType): string {
  return ENTITY_SCHEMA_CONTENT[entityType] ?? `# TikTok ${entityType}\n\nNo schema information available.\n`;
}

function buildAllSchemasMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_SCHEMA_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://tiktok/${entityType}`,
  name: `TikTok ${entityType} Schema`,
  description: `Field reference for TikTok ${entityType} entity including required fields, optional fields, and read-only fields`,
  mimeType: "text/markdown",
  getContent: () => buildEntitySchemaMarkdown(entityType),
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://tiktok/all",
  name: "TikTok All Entity Schemas",
  description: "Combined field reference for all TikTok Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllSchemasMarkdown,
};
