/**
 * AmazonDsp Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# AmazonDsp Ads Entity Hierarchy

## Relationship Diagram

\`\`\`
Advertiser (profile_id: XXXXXXXXXX)
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

1. **Advertiser** — pre-exists; discover with \`amazon_dsp_list_profiles\`
2. **Creative(s)** — optional; can upload via Creative Library or reference video/image IDs
3. **Campaign** — requires \`campaign_name\`, \`objective_type\`, \`budget_mode\`, \`budget\`
4. **Ad Group(s)** — requires \`campaign_id\`, \`adgroup_name\`, \`placement_type\`, \`budget\`
5. **Ad(s)** — requires \`adgroup_id\`, \`ad_name\`, \`creative_type\`, creative assets

## AmazonDsp API Patterns

### Read: GET with profile_id in query params
\`\`\`
GET /open_api/v1.3/campaign/get/?profile_id=123&page=1&page_size=10
Authorization: Bearer <token>
\`\`\`

### Create: POST with profile_id in JSON body
\`\`\`
POST /open_api/v1.3/campaign/create/
{ "profile_id": "123", "campaign_name": "...", ... }
\`\`\`

### Update: POST with entity ID + profile_id in JSON body
\`\`\`
POST /open_api/v1.3/campaign/update/
{ "profile_id": "123", "campaign_id": "456", "budget": 200 }
\`\`\`

### Status Update: Separate endpoint, POST with IDs array
\`\`\`
POST /open_api/v1.3/campaign/status/update/
{ "profile_id": "123", "campaign_ids": ["456", "789"], "operation_status": "DISABLE" }
\`\`\`

### Delete: Separate endpoint, POST with IDs array
\`\`\`
POST /open_api/v1.3/campaign/delete/
{ "profile_id": "123", "campaign_ids": ["456"] }
\`\`\`

### Response Shape
All AmazonDsp API responses follow this structure:
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

AmazonDsp uses page-based pagination (NOT cursor-based):
- \`page\` — page number (1-based)
- \`page_size\` — items per page (max 1000 for some endpoints)
- Response: \`page_info.total_page\` shows total pages

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`amazon_dsp_list_entities\` | List entities with filters | |
| \`amazon_dsp_get_entity\` | Get single entity | |
| \`amazon_dsp_create_entity\` | Create single entity | |
| \`amazon_dsp_update_entity\` | Update single entity | |
| \`amazon_dsp_delete_entity\` | Delete entities | ✓ |
| \`amazon_dsp_list_profiles\` | List accessible advertisers | |
| \`amazon_dsp_get_report\` | Async report with polling | |
| \`amazon_dsp_get_report_breakdowns\` | Report with breakdown dimensions | |
| \`amazon_dsp_bulk_update_status\` | Batch status update | ✓ |
| \`amazon_dsp_bulk_create_entities\` | Batch entity creation | ✓ |
| \`amazon_dsp_bulk_update_entities\` | Batch entity updates | ✓ |
| \`amazon_dsp_adjust_bids\` | Batch bid adjustment | ✓ |
| \`amazon_dsp_search_targeting\` | Search targeting options | |
| \`amazon_dsp_get_targeting_options\` | Browse targeting categories | |
| \`amazon_dsp_duplicate_entity\` | Duplicate campaign/adGroup/ad | |
| \`amazon_dsp_get_audience_estimate\` | Audience size estimation | |
| \`amazon_dsp_get_ad_preview\` | Ad preview data | |
| \`amazon_dsp_validate_entity\` | Client-side payload validation | |

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
  uri: "entity-hierarchy://amazonDsp/all",
  name: "AmazonDsp Entity Hierarchy",
  description:
    "Parent-child relationships between AmazonDsp Ads entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
