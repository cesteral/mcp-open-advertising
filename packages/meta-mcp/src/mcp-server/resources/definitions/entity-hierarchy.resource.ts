/**
 * Meta Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# Meta Ads Entity Hierarchy

## Relationship Diagram

\`\`\`
Ad Account (act_XXXXXXXXX)
  ├── Campaign
  │     └── Ad Set
  │           └── Ad (references: Ad Creative)
  ├── Ad Creative (reusable across ads)
  └── Custom Audience (reusable for targeting)
\`\`\`

## Entity Types (5 total)

| Entity Type | API Edge | Display Name | Supports Duplicate |
|-------------|----------|--------------|:---:|
| **campaign** | \`campaigns\` | Campaign | ✓ |
| **adSet** | \`adsets\` | Ad Set | ✓ |
| **ad** | \`ads\` | Ad | ✓ |
| **adCreative** | \`adcreatives\` | Ad Creative | |
| **customAudience** | \`customaudiences\` | Custom Audience | |

## Key Relationships

### Core Hierarchy: Account → Campaign → Ad Set → Ad
- All entities are created under an ad account (flat, not nested).
- A campaign has one or more ad sets.
- An ad set has one or more ads.
- An ad references an ad creative via \`creative.creative_id\`.

### Reusable Entities
- **Ad Creatives** are shared across ads within the same ad account.
- **Custom Audiences** are used in ad set targeting specifications.

## Creation Order

Full campaign structure (top-down):

1. **Ad Account** — usually pre-exists; verify with \`meta_list_ad_accounts\`
2. **Custom Audience(s)** — create if using custom audience targeting
3. **Ad Creative(s)** — create before ads that reference them
4. **Campaign** — requires \`name\`, \`objective\`, \`special_ad_categories\`
5. **Ad Set(s)** — requires \`campaign_id\`, \`targeting\`, \`optimization_goal\`, \`billing_event\`
6. **Ad(s)** — requires \`adset_id\`, \`creative\` (with creative_id)

## Meta API Patterns

### Create: POST /act_{id}/{edge}
All entities are created via the ad account edge.

### Read: GET /{entityId}?fields=...
**Important:** Meta returns NO fields by default. You must explicitly request fields.

### Update: POST /{entityId} (PATCH semantics)
Only provided fields are updated. Returns \`{ success: true }\`, NOT the full entity.

### Delete: DELETE /{entityId}
Active entities must be paused first.

### List: GET /act_{id}/{edge}?fields=...&filtering=[...]
Uses cursor-based pagination (\`after\` parameter).

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`meta_list_entities\` | List entities with filters | |
| \`meta_get_entity\` | Get single entity | |
| \`meta_create_entity\` | Create single entity | |
| \`meta_update_entity\` | Update single entity | |
| \`meta_delete_entity\` | Delete single entity | |
| \`meta_list_ad_accounts\` | List accessible ad accounts | |
| \`meta_get_insights\` | Get performance insights | |
| \`meta_get_insights_breakdowns\` | Get insights with breakdowns | |
| \`meta_bulk_update_status\` | Batch status update | ✓ |
| \`meta_bulk_create_entities\` | Batch entity creation | ✓ |
| \`meta_search_targeting\` | Search targeting options | |
| \`meta_get_targeting_options\` | Browse targeting categories | |
| \`meta_duplicate_entity\` | Duplicate campaign/adSet/ad | |
| \`meta_get_delivery_estimate\` | Audience size estimation | |
| \`meta_get_ad_preview\` | Ad preview HTML | |
| \`meta_adjust_bids\` | Batch adjust ad set bid amounts | ✓ |
| \`meta_validate_entity\` | Client-side payload validation | |

## Budget Notes

- Budget values are in **cents** (1000 = $10 USD)
- Zero-decimal currencies (JPY, KRW, VND) use base unit
- Budget changes limited to ~4/hour per ad set
- Campaign Budget Optimization (CBO): set \`campaign_budget_optimization\` on campaign

## Campaign Objectives (ODAX)

| Objective | Replaces |
|-----------|----------|
| OUTCOME_AWARENESS | BRAND_AWARENESS, REACH |
| OUTCOME_TRAFFIC | LINK_CLICKS, TRAFFIC |
| OUTCOME_ENGAGEMENT | POST_ENGAGEMENT, PAGE_LIKES, VIDEO_VIEWS |
| OUTCOME_LEADS | LEAD_GENERATION |
| OUTCOME_SALES | CONVERSIONS, CATALOG_SALES |
| OUTCOME_APP_PROMOTION | APP_INSTALLS |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://all",
  name: "Meta Entity Hierarchy",
  description:
    "Parent-child relationships between Meta Ads entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
