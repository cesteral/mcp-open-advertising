/**
 * TikTok Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# TikTok Ads Entity Hierarchy

## Relationship Diagram

\`\`\`
Advertiser (advertiser_id: XXXXXXXXXX)
  ├── Campaign (campaign_id)
  │     └── Ad Group (adgroup_id)
  │           └── Ad (ad_id)  ← references Creative
  └── Creative (creative_id, reusable across ads)
\`\`\`

## Entity Types (4 total)

| Entity Type | List Endpoint | Create Endpoint | ID Field |
|-------------|---------------|-----------------|----------|
| **campaign** | \`/open_api/v1.3/campaign/get/\` | \`/open_api/v1.3/campaign/create/\` | campaign_id |
| **adGroup** | \`/open_api/v1.3/adgroup/get/\` | \`/open_api/v1.3/adgroup/create/\` | adgroup_id |
| **ad** | \`/open_api/v1.3/ad/get/\` | \`/open_api/v1.3/ad/create/\` | ad_id |
| **creative** | \`/open_api/v1.3/creative/adcreative/get/\` | \`/open_api/v1.3/creative/adcreative/create/\` | creative_id |

## Key Relationships

### Core Hierarchy: Advertiser → Campaign → Ad Group → Ad
- A campaign has one or more ad groups.
- An ad group has one or more ads.
- An ad references creative assets (video_id or image_ids).

### Reusable Entities
- **Creatives** can be referenced by multiple ads within the same advertiser.

## Creation Order

Full campaign structure (top-down):

1. **Advertiser** — pre-exists; discover with \`tiktok_list_advertisers\`
2. **Creative(s)** — optional; can upload via Creative Library or reference video/image IDs
3. **Campaign** — requires \`campaign_name\`, \`objective_type\`, \`budget_mode\`, \`budget\`
4. **Ad Group(s)** — requires \`campaign_id\`, \`adgroup_name\`, \`placement_type\`, \`budget\`
5. **Ad(s)** — requires \`adgroup_id\`, \`ad_name\`, \`creative_type\`, creative assets

## TikTok API Patterns

### Read: GET with advertiser_id in query params
\`\`\`
GET /open_api/v1.3/campaign/get/?advertiser_id=123&page=1&page_size=10
Authorization: Bearer <token>
\`\`\`

### Create: POST with advertiser_id in JSON body
\`\`\`
POST /open_api/v1.3/campaign/create/
{ "advertiser_id": "123", "campaign_name": "...", ... }
\`\`\`

### Update: POST with entity ID + advertiser_id in JSON body
\`\`\`
POST /open_api/v1.3/campaign/update/
{ "advertiser_id": "123", "campaign_id": "456", "budget": 200 }
\`\`\`

### Status Update: Separate endpoint, POST with IDs array
\`\`\`
POST /open_api/v1.3/campaign/status/update/
{ "advertiser_id": "123", "campaign_ids": ["456", "789"], "operation_status": "DISABLE" }
\`\`\`

### Delete: Separate endpoint, POST with IDs array
\`\`\`
POST /open_api/v1.3/campaign/delete/
{ "advertiser_id": "123", "campaign_ids": ["456"] }
\`\`\`

### Response Shape
All TikTok API responses follow this structure:
\`\`\`json
{
  "code": 0,
  "message": "OK",
  "data": { "list": [...], "page_info": { "page": 1, "page_size": 10, "total_number": 100, "total_page": 10 } }
}
\`\`\`
- \`code: 0\` = success
- \`code != 0\` = error (check \`message\` for details)

## Pagination

TikTok uses page-based pagination (NOT cursor-based):
- \`page\` — page number (1-based)
- \`page_size\` — items per page (max 1000 for some endpoints)
- Response: \`page_info.total_page\` shows total pages

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`tiktok_list_entities\` | List entities with filters | |
| \`tiktok_get_entity\` | Get single entity | |
| \`tiktok_create_entity\` | Create single entity | |
| \`tiktok_update_entity\` | Update single entity | |
| \`tiktok_delete_entity\` | Delete entities | ✓ |
| \`tiktok_list_advertisers\` | List accessible advertisers | |
| \`tiktok_get_report\` | Async report with polling | |
| \`tiktok_get_report_breakdowns\` | Report with breakdown dimensions | |
| \`tiktok_bulk_update_status\` | Batch status update | ✓ |
| \`tiktok_bulk_create_entities\` | Batch entity creation | ✓ |
| \`tiktok_bulk_update_entities\` | Batch entity updates | ✓ |
| \`tiktok_adjust_bids\` | Batch bid adjustment | ✓ |
| \`tiktok_search_targeting\` | Search targeting options | |
| \`tiktok_get_targeting_options\` | Browse targeting categories | |
| \`tiktok_duplicate_entity\` | Duplicate campaign/adGroup/ad | |
| \`tiktok_get_audience_estimate\` | Audience size estimation | |
| \`tiktok_get_ad_previews\` | Ad preview data | |
| \`tiktok_validate_entity\` | Client-side payload validation | |

## Budget Notes

- Budget values are in the advertiser's account currency (no cents conversion)
- \`budget_mode\`: BUDGET_MODE_DAY (daily) or BUDGET_MODE_TOTAL (lifetime)
- Minimum budget varies by objective and market

## Campaign Objectives

| Objective | Use Case |
|-----------|----------|
| TRAFFIC | Drive website/app traffic |
| APP_INSTALLS | Drive app downloads |
| CONVERSIONS | Optimize for conversion events |
| AWARENESS | Brand awareness / reach |
| VIDEO_VIEWS | Maximize video plays |
| LEAD_GENERATION | In-app lead forms |
| CATALOG_SALES | Dynamic product ads |
| COMMUNITY_INTERACTION | Profile visits, follows |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://tiktok/all",
  name: "TikTok Entity Hierarchy",
  description:
    "Parent-child relationships between TikTok Ads entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
