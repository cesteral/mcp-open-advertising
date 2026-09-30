// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# Snapchat Ads Entity Hierarchy

## Relationship Diagram

\`\`\`
Ad Account (ad_account_id: XXXXXXXXXX)
  ├── Campaign (campaign_id)
  │     └── Ad Squad (adsquad_id)  ← "adGroup" in this server
  │           └── Ad (ad_id)  ← references Creative
  └── Creative (creative_id, reusable across ads)
\`\`\`

## Entity Types (4 total)

| Entity Type | List Endpoint | Create Endpoint | ID Field |
|-------------|---------------|-----------------|----------|
| **campaign** | \`GET /v1/adaccounts/{adAccountId}/campaigns\` | \`POST /v1/adaccounts/{adAccountId}/campaigns\` | id |
| **adGroup** (Ad Squad) | \`GET /v1/campaigns/{campaignId}/adsquads\` | \`POST /v1/campaigns/{campaignId}/adsquads\` | id |
| **ad** | \`GET /v1/adsquads/{adSquadId}/ads\` | \`POST /v1/adsquads/{adSquadId}/ads\` | id |
| **creative** | \`GET /v1/adaccounts/{adAccountId}/creatives\` | \`POST /v1/adaccounts/{adAccountId}/creatives\` | id |

## Key Relationships

### Core Hierarchy: Ad Account → Campaign → Ad Squad → Ad
- A campaign has one or more ad squads (adGroups).
- An ad squad has one or more ads.
- An ad references a creative asset.

### Reusable Entities
- **Creatives** can be referenced by multiple ads within the same ad account.

## Creation Order

Full campaign structure (top-down):

1. **Ad Account** — pre-exists; discover with \`snapchat_list_ad_accounts\`
2. **Creative(s)** — optional; upload media via \`snapchat_upload_image\` / \`snapchat_upload_video\`, then create creative
3. **Campaign** — requires \`name\`, \`status\`, \`start_time\`, \`objective_v2_properties\`, \`daily_budget_micro\`
4. **Ad Squad(s)** — requires \`campaign_id\`, \`name\`, \`status\`, \`type\`, \`placement_v2\`, \`billing_event\`, \`bid_strategy\`, \`optimization_goal\`, \`targeting\`, \`bid_micro\`, \`daily_budget_micro\`
5. **Ad(s)** — requires \`ad_squad_id\`, \`name\`, \`status\`, \`creative_id\`, \`type\`

## Snapchat Ads API v1 Patterns

### List campaigns
\`\`\`
GET /v1/adaccounts/{adAccountId}/campaigns
Authorization: Bearer <token>
\`\`\`

### Create campaign
\`\`\`
POST /v1/adaccounts/{adAccountId}/campaigns
{ "campaigns": [{ "name": "...", "status": "PAUSED", "start_time": "2026-01-01T00:00:00Z", "objective_v2_properties": { "objective_v2_type": "SALES" }, "daily_budget_micro": 10000000 }] }
\`\`\`

### Update campaign
\`\`\`
PUT /v1/campaigns/{campaignId}
{ "campaigns": [{ "id": "...", "name": "...", "status": "ACTIVE" }] }
\`\`\`

### Delete campaign
\`\`\`
DELETE /v1/campaigns/{campaignId}
\`\`\`

### List ad squads
\`\`\`
GET /v1/campaigns/{campaignId}/adsquads
\`\`\`

### Create ad squad
\`\`\`
POST /v1/campaigns/{campaignId}/adsquads
{ "adsquads": [{ "name": "...", "status": "PAUSED", "type": "SNAP_ADS", "placement_v2": { "config": "AUTOMATIC", "platforms": ["SNAPCHAT"] }, "billing_event": "IMPRESSION", "bid_strategy": "LOWEST_COST_WITH_MAX_BID", "optimization_goal": "IMPRESSIONS", "targeting": { "geos": [{ "country_code": "us" }] }, "bid_micro": 1000000, "daily_budget_micro": 5000000 }] }
\`\`\`

### Update ad squad
\`\`\`
PUT /v1/adsquads/{adSquadId}
{ "adsquads": [{ "id": "...", "bid_micro": 2000000 }] }
\`\`\`

### List ads
\`\`\`
GET /v1/adsquads/{adSquadId}/ads
\`\`\`

### Create ad
\`\`\`
POST /v1/adsquads/{adSquadId}/ads
{ "ads": [{ "name": "...", "status": "PAUSED", "type": "SNAP_AD", "creative_id": "..." }] }
\`\`\`

### Update ad
\`\`\`
PUT /v1/ads/{adId}
{ "ads": [{ "id": "...", "status": "ACTIVE" }] }
\`\`\`

### List creatives
\`\`\`
GET /v1/adaccounts/{adAccountId}/creatives
\`\`\`

### Create creative
\`\`\`
POST /v1/adaccounts/{adAccountId}/creatives
{ "creatives": [{ "name": "...", "type": "SNAP_AD", "ad_account_id": "...", "brand_name": "...", "headline": "...", "top_snap_media_id": "..." }] }
\`\`\`

## Response Envelope

All Snapchat API responses follow this structure:
\`\`\`json
{
  "request_status": "SUCCESS",
  "request_id": "...",
  "campaigns": [
    {
      "sub_request_status": "SUCCESS",
      "campaign": { "id": "...", "name": "...", ... }
    }
  ]
}
\`\`\`
- \`request_status: "SUCCESS"\` = top-level success
- \`request_status: "FAILED"\` = error (check \`display_message\`)
- Each entity item has its own \`sub_request_status\`

## Pagination

Snapchat uses cursor-based pagination:
- Response includes a \`cursor\` field for the next page
- Pass \`cursor\` as a query param to get the next page of results

## Budget

- Budget values are in **micro-currency** (1,000,000 = $1.00 USD, or equivalent in account currency)
- \`daily_budget_micro\`: daily spend cap
- \`lifetime_spend_cap_micro\`: lifetime total cap
- Example: $10/day = 10,000,000 micro

## Campaign Objectives

Set via \`objective_v2_properties.objective_v2_type\` (add \`promotion_type\` where relevant):

| objective_v2_type | Use Case |
|-------------------|----------|
| AWARENESS_AND_ENGAGEMENT | Reach, brand awareness, stories/places promotion |
| APP_PROMOTION | App installs and app conversions (\`promotion_type\`: e.g. APP_INSTALL) |
| TRAFFIC | Drive website visits or app re-engagement |
| SALES | Website conversions and catalog sales |

The legacy \`objective\` attribute is auto-translated by Snap to the above (from 2025-03-21) but should not be sent by new integrations.

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`snapchat_list_entities\` | List entities with filters | |
| \`snapchat_get_entity\` | Get single entity | |
| \`snapchat_create_entity\` | Create single entity | |
| \`snapchat_update_entity\` | Update single entity | |
| \`snapchat_delete_entity\` | Delete entities | ✓ |
| \`snapchat_list_ad_accounts\` | List accessible ad accounts | |
| \`snapchat_get_report\` | Async report with polling | |
| \`snapchat_get_report_breakdowns\` | Report split by a \`report_dimension\` (geo, demographic, device, interest) | |
| \`snapchat_bulk_update_status\` | Batch status update | ✓ |
| \`snapchat_bulk_create_entities\` | Batch entity creation | ✓ |
| \`snapchat_bulk_update_entities\` | Batch entity updates | ✓ |
| \`snapchat_adjust_bids\` | Batch bid adjustment | ✓ |
| \`snapchat_search_targeting\` | Search targeting options | |
| \`snapchat_get_targeting_options\` | Browse targeting categories | |
| \`snapchat_get_audience_estimate\` | Audience size estimation | |
| \`snapchat_get_ad_preview\` | Ad preview data | |
| \`snapchat_validate_entity\` | Client-side payload validation | |
| \`snapchat_upload_image\` | Upload image to media library | |
| \`snapchat_upload_video\` | Upload video to media library (polls) | |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://snapchat/all",
  name: "Snapchat Entity Hierarchy",
  description:
    "Parent-child relationships between Snapchat Ads entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
