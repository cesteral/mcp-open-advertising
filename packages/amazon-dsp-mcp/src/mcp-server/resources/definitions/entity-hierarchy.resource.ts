/**
 * Amazon DSP Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# Amazon DSP Entity Hierarchy

## Relationship Diagram

\`\`\`
Advertiser (advertiserId: XXXXXXXXXX)
  ├── Order (orderId)
  │     └── Line Item (lineItemId)
  │           └── Creative (creativeId, assigned to line item)
  └── Creative (creativeId, reusable across line items)
\`\`\`

## Entity Types (4 total)

| Entity Type | List Endpoint | Get Endpoint | ID Field |
|-------------|---------------|--------------|----------|
| **advertiser** | \`GET /dsp/advertisers\` | — | advertiserId |
| **order** | \`GET /dsp/orders?advertiserId=...\` | \`GET /dsp/orders/{orderId}\` | orderId |
| **lineItem** | \`GET /dsp/lineitems?orderId=...\` | \`GET /dsp/lineitems/{lineItemId}\` | lineItemId |
| **creative** | \`GET /dsp/creatives?advertiserId=...\` | \`GET /dsp/creatives/{creativeId}\` | creativeId |

## API Path Reference

| Method | Path | Description |
|--------|------|-------------|
| \`GET\` | \`/dsp/advertisers\` | List advertisers |
| \`GET\` | \`/dsp/orders?advertiserId=...\` | List orders for advertiser |
| \`GET\` | \`/dsp/orders/{orderId}\` | Get order |
| \`POST\` | \`/dsp/orders\` | Create order |
| \`PUT\` | \`/dsp/orders/{orderId}\` | Update order (also used for ARCHIVE — no DELETE endpoint) |
| \`GET\` | \`/dsp/lineitems?orderId=...\` | List line items for order |
| \`GET\` | \`/dsp/lineitems/{lineItemId}\` | Get line item |
| \`POST\` | \`/dsp/lineitems\` | Create line item |
| \`PUT\` | \`/dsp/lineitems/{lineItemId}\` | Update line item |
| \`GET\` | \`/dsp/creatives?advertiserId=...\` | List creatives for advertiser |
| \`GET\` | \`/dsp/creatives/{creativeId}\` | Get creative |
| \`POST\` | \`/dsp/creatives\` | Create creative |
| \`PUT\` | \`/dsp/creatives/{creativeId}\` | Update creative |

## Key Relationships

### Core Hierarchy: Advertiser → Order → Line Item → Creative
- An order belongs to one advertiser.
- A line item belongs to one order.
- A creative can be associated with multiple line items within the same advertiser.

### Reusable Entities
- **Creatives** are scoped to an advertiser and can be assigned to multiple line items.

## Creation Order

Full campaign structure (top-down):

1. **Advertiser** — pre-exists; discover with \`amazon_dsp_list_advertisers\`
2. **Order** — requires \`advertiserId\`, \`name\`, \`startDateTime\`, \`endDateTime\`, \`budget\`
3. **Creative(s)** — requires \`advertiserId\`, \`name\`, \`creativeType\`
4. **Line Item(s)** — requires \`orderId\`, \`name\`, \`startDateTime\`, \`endDateTime\`, \`budget\`, \`bidding\`

## Amazon DSP API Patterns

### Read: GET with query params
\`\`\`
GET /dsp/orders?advertiserId=123&startIndex=0&count=10
Amazon-Advertising-API-ClientId: <clientId>
Authorization: Bearer <access_token>
Amazon-Advertising-API-Scope: <profileId>
\`\`\`

### Create: POST with JSON body
\`\`\`
POST /dsp/orders
Content-Type: application/json
{ "advertiserId": "123", "name": "My Order", ... }
\`\`\`

### Update: PUT with entity ID in path
\`\`\`
PUT /dsp/orders/{orderId}
Content-Type: application/json
{ "name": "Updated Order Name", "budget": 5000 }
\`\`\`

### Archive (Soft Delete): PUT with state field
\`\`\`
PUT /dsp/orders/{orderId}
{ "state": "archived" }
\`\`\`

⚠️ **GOTCHA**: Amazon DSP has **no DELETE endpoint** for orders and line items. To remove an entity, set \`state: "archived"\` via a PUT update. Use \`amazon_dsp_delete_entity\` which handles this automatically.

### Response Shape
Amazon DSP API responses are **raw JSON** (no envelope):
\`\`\`json
[
  { "orderId": "123", "name": "My Order", "state": "delivering", ... },
  ...
]
\`\`\`
- No \`code\` field — HTTP status indicates success/failure
- List endpoints return arrays directly
- Single-entity endpoints return the object directly

## Pagination

Amazon DSP uses offset-based pagination:
- \`startIndex\` — zero-based offset (default: 0)
- \`count\` — items per page (default: 10, max varies by endpoint)
- Response: \`totalResults\` shows total count (where supported)

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`amazon_dsp_list_entities\` | List entities with filters | |
| \`amazon_dsp_get_entity\` | Get single entity | |
| \`amazon_dsp_create_entity\` | Create single entity | |
| \`amazon_dsp_update_entity\` | Update single entity | |
| \`amazon_dsp_delete_entity\` | Archive entities (soft delete) | ✓ |
| \`amazon_dsp_list_advertisers\` | List accessible advertisers | |
| \`amazon_dsp_get_report\` | Async report with polling | |
| \`amazon_dsp_get_report_breakdowns\` | Report with breakdown dimensions | |
| \`amazon_dsp_bulk_update_status\` | Batch status update | ✓ |
| \`amazon_dsp_bulk_create_entities\` | Batch entity creation | ✓ |
| \`amazon_dsp_bulk_update_entities\` | Batch entity updates | ✓ |
| \`amazon_dsp_adjust_bids\` | Batch bid adjustment | ✓ |
| \`amazon_dsp_search_targeting\` | Search targeting options | |
| \`amazon_dsp_get_targeting_options\` | Browse targeting categories | |
| \`amazon_dsp_duplicate_entity\` | Duplicate order/lineItem/creative | |
| \`amazon_dsp_get_audience_estimate\` | Audience size estimation | |
| \`amazon_dsp_get_ad_preview\` | Ad preview data | |
| \`amazon_dsp_validate_entity\` | Client-side payload validation | |

## Budget Notes

- Budget values are in USD (no cents conversion — \`budget: 1000\` means $1000.00)
- Orders and line items have their own budget fields
- Line item budget cannot exceed order budget

## Line Item Goals

| Goal Type | Use Case |
|-----------|----------|
| AWARENESS | Brand reach and visibility |
| CONSIDERATION | Drive engagement and product detail views |
| PURCHASE | Drive conversions and sales |
| LOYALTY | Retain existing customers |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://amazonDsp/all",
  name: "Amazon DSP Entity Hierarchy",
  description:
    "Parent-child relationships between Amazon DSP entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
