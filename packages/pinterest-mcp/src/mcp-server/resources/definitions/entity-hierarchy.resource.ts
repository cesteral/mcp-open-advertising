// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# Pinterest Ads Entity Hierarchy

## Relationship Diagram

\`\`\`
Advertiser (ad_account_id: XXXXXXXXXX)
  ├── Campaign (campaign_id)
  │     └── Ad Group (adgroup_id)
  │           └── Ad (ad_id)  ← references Creative
  └── Creative (creative_id, reusable across ads)
\`\`\`

## Entity Types (4 total)

| Entity Type | List Endpoint | Create Endpoint | ID Field |
|-------------|---------------|-----------------|----------|
| **campaign** | \`GET /v5/ad_accounts/{ad_account_id}/campaigns\` | \`POST /v5/ad_accounts/{ad_account_id}/campaigns\` | id |
| **adGroup** | \`GET /v5/ad_accounts/{ad_account_id}/ad_groups\` | \`POST /v5/ad_accounts/{ad_account_id}/ad_groups\` | id |
| **ad** | \`GET /v5/ad_accounts/{ad_account_id}/ads\` | \`POST /v5/ad_accounts/{ad_account_id}/ads\` | id |
| **creative** | \`GET /v5/pins/{pin_id}\` | \`POST /v5/pins\` | id |

## Key Relationships

### Core Hierarchy: Advertiser → Campaign → Ad Group → Ad
- A campaign has one or more ad groups.
- An ad group has one or more ads.
- An ad references creative assets (video_id or image_ids).

### Reusable Entities
- **Creatives** can be referenced by multiple ads within the same advertiser.

## Creation Order

Full campaign structure (top-down):

1. **Advertiser** — pre-exists; discover with \`pinterest_list_ad_accounts\`
2. **Creative(s)** — optional; can upload via Creative Library or reference video/image IDs
3. **Campaign** — requires \`campaign_name\`, \`objective_type\`, \`budget_mode\`, \`budget\`
4. **Ad Group(s)** — requires \`campaign_id\`, \`adgroup_name\`, \`placement_type\`, \`budget\`
5. **Ad(s)** — requires \`adgroup_id\`, \`ad_name\`, \`creative_type\`, creative assets

## Pinterest API Patterns

### Read: GET with ad_account_id in URL path
\`\`\`
GET /v5/ad_accounts/123/campaigns?page_size=25&bookmark=<cursor>
Authorization: Bearer <token>
\`\`\`

### Create: POST with entity fields in JSON body
\`\`\`
POST /v5/ad_accounts/123/campaigns
{ "name": "My Campaign", "objective_type": "TRAFFIC", "status": "ACTIVE", ... }
\`\`\`

### Update: PATCH with changed fields in JSON body
\`\`\`
PATCH /v5/ad_accounts/123/campaigns
{ "items": [{ "id": "456", "name": "Updated Name", "status": "PAUSED" }] }
\`\`\`

### Delete: DELETE with IDs in query params
\`\`\`
DELETE /v5/ad_accounts/123/campaigns?campaign_ids=456&campaign_ids=789
\`\`\`

### Response Shape
List responses use cursor-based pagination:
\`\`\`json
{
  "items": [...],
  "bookmark": "<next_cursor>"
}
\`\`\`
- \`bookmark\` is absent when there are no more pages
- Single-entity responses return the entity object directly

## Pagination

Pinterest uses cursor-based pagination (NOT page-number based):
- \`page_size\` — items per page (default 25, max 250)
- \`bookmark\` — cursor token for next page (pass from previous response)
- Response: no \`bookmark\` = last page

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`pinterest_list_entities\` | List entities with filters | |
| \`pinterest_get_entity\` | Get single entity | |
| \`pinterest_create_entity\` | Create single entity | |
| \`pinterest_update_entity\` | Update single entity | |
| \`pinterest_delete_entity\` | Delete entities | ✓ |
| \`pinterest_list_ad_accounts\` | List accessible advertisers | |
| \`pinterest_get_report\` | Async report with polling | |
| \`pinterest_get_report_breakdowns\` | Report with breakdown dimensions | |
| \`pinterest_bulk_update_status\` | Batch status update | ✓ |
| \`pinterest_bulk_create_entities\` | Batch entity creation | ✓ |
| \`pinterest_bulk_update_entities\` | Batch entity updates | ✓ |
| \`pinterest_adjust_bids\` | Batch bid adjustment | ✓ |
| \`pinterest_search_targeting\` | Search targeting options | |
| \`pinterest_get_targeting_options\` | Browse targeting categories | |
| \`pinterest_duplicate_entity\` | Duplicate campaign/adGroup/ad | |
| \`pinterest_get_audience_estimate\` | Audience size estimation | |
| \`pinterest_get_ad_preview\` | Ad preview data | |
| \`pinterest_validate_entity\` | Client-side payload validation | |

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
  uri: "entity-hierarchy://pinterest/all",
  name: "Pinterest Entity Hierarchy",
  description:
    "Parent-child relationships between Pinterest Ads entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};