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
Ad account (ad_account_id)
  └── Campaign (id; objective_type, spend caps)
        └── Ad Group (id; campaign_id, budget, bid, targeting_spec)
              └── Ad (id; ad_group_id, pin_id)  ← promotes a Pin

Pin (id; board_id, media_source)  ← the creative. Owned by the user account, not the ad account.
\`\`\`

## Entity Types (4 total)

| Entity Type | List / Get | Create | Update | Removal |
|-------------|-----------|--------|--------|---------|
| **campaign** | \`GET /v5/ad_accounts/{ad_account_id}/campaigns[/{id}]\` | \`POST …/campaigns\` (batch) | \`PATCH …/campaigns\` (batch) | Archive (\`status: ARCHIVED\`) |
| **adGroup** | \`GET /v5/ad_accounts/{ad_account_id}/ad_groups[/{id}]\` | \`POST …/ad_groups\` (batch) | \`PATCH …/ad_groups\` (batch) | Archive |
| **ad** | \`GET /v5/ad_accounts/{ad_account_id}/ads[/{id}]\` | \`POST …/ads\` (batch) | \`PATCH …/ads\` (batch) | Archive |
| **creative** (Pin) | \`GET /v5/pins[/{pin_id}]\` | \`POST /v5/pins\` | \`PATCH /v5/pins/{pin_id}\` | \`DELETE /v5/pins/{pin_id}\` (hard delete) |

## Key Relationships

### Core hierarchy: Ad account → Campaign → Ad Group → Ad
- A campaign has one or more ad groups (\`campaign_id\` on the ad group).
- An ad group has one or more ads (\`ad_group_id\` on the ad).
- An ad promotes exactly one Pin (\`pin_id\`). The creative content (image or video, title, link) lives on the Pin, not the ad.

### Pins
- A Pin belongs to a board (\`board_id\`) and can be promoted by several ads.
- Video Pins reference a video uploaded with \`pinterest_upload_video\` (\`media_source.source_type: "video_id"\`). Image Pins reference a hosted image (\`source_type: "image_url"\`).

## Creation Order

1. **Ad account**: already exists. Find it with \`pinterest_list_ad_accounts\`.
2. **Campaign**: requires \`name\` and \`objective_type\`.
3. **Ad group(s)**: requires \`name\`, \`campaign_id\` and \`billable_event\`. \`budget_in_micro_currency\` is required unless the campaign uses campaign budget optimization.
4. **Pin(s)**: requires \`board_id\` and \`media_source\`. Upload the video first for a video Pin.
5. **Ad(s)**: requires \`ad_group_id\`, \`creative_type\` and \`pin_id\`.

Create everything \`PAUSED\` and activate it after review.

## Pinterest API Patterns

### Batch writes take an array body
\`\`\`
POST /v5/ad_accounts/123/campaigns
[{ "name": "My Campaign", "objective_type": "AWARENESS", "status": "PAUSED" }]

PATCH /v5/ad_accounts/123/campaigns
[{ "id": "456", "status": "PAUSED" }]
\`\`\`
- Up to 30 items per request. The tools send one item per request.
- The response is \`{ "items": [{ "data": {...}, "exceptions": [...] }] }\`, and it is **HTTP 200 even when an item was rejected**. The tools turn a per-item exception into an error.

### No DELETE for campaigns, ad groups or ads
\`pinterest_delete_entity\` archives them with a batch PATCH (\`status: "ARCHIVED"\`). Archiving is permanent. Pins are hard-deleted with \`DELETE /v5/pins/{pin_id}\`.

### Pagination
List endpoints are cursor-based:
- \`page_size\`: items per page (default 25, max 250)
- \`bookmark\`: the cursor from the previous response. There are no more pages when it is absent or null.

## Units

| Field kind | Unit | Example |
|------------|------|---------|
| Money (\`daily_spend_cap\`, \`lifetime_spend_cap\`, \`budget_in_micro_currency\`, \`bid_in_micro_currency\`) | Integer micro-currency | \`50000000\` = 50.00 |
| Times (\`start_time\`, \`end_time\`) | Integer Unix seconds | \`1775001600\` = 2026-04-01 00:00 UTC |
| \`targeting_spec\` keys | UPPERCASE | \`LOCATION\`, \`AGE_BUCKET\`, \`GENDER\` |

\`pinterest_adjust_bids\` is the one tool that takes plain currency units (\`1.5\` = 1.50) and converts them for you.

## Status

- \`status\` (campaign, ad group and ad) is what you set: \`ACTIVE\`, \`PAUSED\`, \`ARCHIVED\`, \`DRAFT\` or \`DELETED_DRAFT\`.
- \`summary_status\` is read-only and reports the delivery state.
- Ads also carry \`review_status\` (\`PENDING\`, \`APPROVED\`, \`REJECTED\`, \`OTHER\`) and \`rejected_reasons\`.

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`pinterest_list_ad_accounts\` | List accessible ad accounts | |
| \`pinterest_list_entities\` | List entities | |
| \`pinterest_get_entity\` | Get one entity | |
| \`pinterest_create_entity\` | Create one entity | |
| \`pinterest_update_entity\` | Update one entity, including \`status\` | |
| \`pinterest_delete_entity\` | Archive campaigns, ad groups or ads, or delete Pins | ✓ |
| \`pinterest_duplicate_entity\` | Copy a campaign | |
| \`pinterest_bulk_create_entities\` | Create up to 50 entities | ✓ |
| \`pinterest_bulk_update_entities\` | Update up to 50 entities | ✓ |
| \`pinterest_bulk_update_status\` | Set ACTIVE, PAUSED or ARCHIVED on many entities | ✓ |
| \`pinterest_adjust_bids\` | Read-modify-write ad group bids | ✓ |
| \`pinterest_upload_video\` | Upload a video for a video Pin | |
| \`pinterest_search_targeting\` / \`pinterest_get_targeting_options\` | Discover targeting values | |
| \`pinterest_get_delivery_estimate\` | Audience size for a \`targeting_spec\` | |
| \`pinterest_get_ad_preview\` | Preview page for an ad's Pin | |
| \`pinterest_get_report\` / \`pinterest_get_report_breakdowns\` | Async reports with polling | |
| \`pinterest_submit_report\` / \`pinterest_check_report_status\` / \`pinterest_download_report\` | Manual async report steps | |
| \`pinterest_get_pacing_status\` | Budget pacing | |
| \`pinterest_validate_entity\` | Client-side payload check | |

## Campaign Objectives (\`objective_type\`)

\`AWARENESS\`, \`CONSIDERATION\`, \`WEB_CONVERSION\`, \`CATALOG_SALES\`, \`VIDEO_COMPLETION\`, \`SALES\`, \`APP_INSTALL\`, \`CTV_CONSIDERATION\`. The objective can only be changed while the campaign is a draft.
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
