// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TikTok Entity Schema Resources
 */
import type { Resource } from "../types.js";
import {
  getSupportedEntityTypes,
  type TikTokEntityType,
} from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMA_CONTENT: Record<TikTokEntityType, string> = {
  campaign: `# TikTok Campaign Fields

## Required Fields (create)
| Field | Type | Description |
|-------|------|-------------|
| campaign_name | string | Campaign display name (max 512 chars) |
| objective_type | string | Campaign objective such as TRAFFIC, APP_PROMOTION, WEB_CONVERSIONS, VIDEO_VIEWS, LEAD_GENERATION |

## Optional Fields
| Field | Type | Description |
|-------|------|-------------|
| operation_status | string | ENABLE or DISABLE |
| budget_mode | string | BUDGET_MODE_DAY (daily) or BUDGET_MODE_TOTAL (lifetime) |
| budget | number | Budget in account currency |
| roas_bid | number | Target ROAS (for ROAS optimization) |
| is_smart_performance_campaign | boolean | Enable smart performance campaign |
| app_promotion_type | string | App-promotion mode for APP_PROMOTION campaigns |

## Read-Only Fields
campaign_id, create_time, modify_time, advertiser_id
`,

  adGroup: `# TikTok Ad Group Fields

## Required Fields (create)
| Field | Type | Description |
|-------|------|-------------|
| campaign_id | string | Parent campaign ID |
| adgroup_name | string | Ad group display name |
| placements | array | Placement enums such as PLACEMENT_TIKTOK |
| schedule_type | string | Schedule mode when required by TikTok |
| pacing | string | Pacing mode when required by TikTok |

## Optional Fields
| Field | Type | Description |
|-------|------|-------------|
| budget_mode | string | BUDGET_MODE_DAY or BUDGET_MODE_TOTAL |
| budget | number | Budget in account currency |
| schedule_start_time | string | Start time (YYYY-MM-DD HH:mm:ss) — required if schedule_type=SCHEDULE_START_END |
| schedule_end_time | string | End time (YYYY-MM-DD HH:mm:ss) |
| bid_price | number | Bid price in account currency |
| optimization_goal | string | Optimization goal such as CLICK or APP_INSTALL |
| billing_event | string | Billing event such as CPC, CPM, OCPM |
| age | array | Age ranges: AGE_13_17, AGE_18_24, AGE_25_34, AGE_35_44, AGE_45_54, AGE_55_100 |
| gender | array | GENDER_UNLIMITED, GENDER_MALE, GENDER_FEMALE |
| location_ids | array | Array of location IDs (country codes or region IDs) |
| interest_category_ids | array | Interest category IDs |
| languages | array | Language codes (e.g., ["en", "zh"]) |
| placements | array | Specific placement IDs |
| device_platforms | array | DESKTOP or MOBILE |
| operating_systems | array | IOS or ANDROID |

## Read-Only Fields
 adgroup_id, campaign_id (inherited), create_time, modify_time
`,

  ad: `# TikTok Ad Fields

## Required Fields (create)
| Field | Type | Description |
|-------|------|-------------|
| adgroup_id | string | Parent ad group ID |
| creatives | array | TikTok creatives array payload required by AdCreateBody |

## Common Creative Fields
| Field | Type | Description |
|-------|------|-------------|
| creatives[].ad_name | string | Ad display name |
| creatives[].video_id | string | Video ID from TikTok Creative Library |
| creatives[].image_ids | array | Array of image IDs (for image-based ads) |

## Optional Creative Fields
| Field | Type | Description |
|-------|------|-------------|
| ad_text | string | Ad copy text (max 100 chars) |
| app_name | string | App name shown in the ad |
| landing_page_url | string | Destination URL |
| display_name | string | Display brand name |
| profile_image_url | string | Brand profile image URL |
| call_to_action | string | CTA text: LEARN_MORE, SHOP_NOW, DOWNLOAD, SIGN_UP, etc. |
| patch_update | boolean | Optional partial-update behavior on update |

## Read-Only Fields
ad_id, adgroup_id (inherited), create_time, modify_time
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
  return (
    ENTITY_SCHEMA_CONTENT[entityType] ??
    `# TikTok ${entityType}\n\nNo schema information available.\n`
  );
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
