/**
 * Google Ads Entity Hierarchy Resource
 *
 * Documents parent-child relationships and API patterns for Google Ads entities.
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# Google Ads Entity Hierarchy

## Relationship Diagram

\`\`\`
Customer (Google Ads Account)
  ├── Campaign Budget (shared or dedicated)
  ├── Campaign
  │     ├── Ad Group
  │     │     ├── Ad (AdGroupAd)
  │     │     ├── Keyword (AdGroupCriterion)
  │     │     └── (Targeting criteria)
  │     └── Campaign-level targeting (locations, languages)
  └── Asset (reusable text/image/video/sitelink/callout)
        ├── CampaignAsset (links asset to campaign)
        └── AdGroupAsset (links asset to ad group)
\`\`\`

## Entity Types (6 in Phase 1)

| Entity Type | GAQL Resource | Mutate Endpoint | Parent |
|-------------|--------------|-----------------|--------|
| **campaign** | \`campaign\` | \`campaigns:mutate\` | customerId |
| **adGroup** | \`ad_group\` | \`adGroups:mutate\` | customerId + campaign |
| **ad** | \`ad_group_ad\` | \`adGroupAds:mutate\` | customerId + adGroup |
| **keyword** | \`ad_group_criterion\` | \`adGroupCriteria:mutate\` | customerId + adGroup |
| **campaignBudget** | \`campaign_budget\` | \`campaignBudgets:mutate\` | customerId |
| **asset** | \`asset\` | \`assets:mutate\` | customerId |

## API Patterns

### Reading: GAQL Queries
All reads use GAQL via \`POST /customers/{customerId}/googleAds:search\`:
\`\`\`json
{
  "query": "SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = 'ENABLED'"
}
\`\`\`

### Writing: :mutate Endpoints
All writes use \`POST /customers/{customerId}/{resource}:mutate\`:
\`\`\`json
{
  "operations": [
    { "create": { "name": "My Campaign", ... } },
    { "update": { "resourceName": "customers/123/campaigns/456", "name": "Updated" }, "updateMask": "name" },
    { "remove": "customers/123/campaigns/789" }
  ]
}
\`\`\`

### Resource Names
Every entity has a resource name: \`customers/{customerId}/{entityType}/{entityId}\`
- Campaign: \`customers/123/campaigns/456\`
- Ad Group: \`customers/123/adGroups/789\`
- Campaign Budget: \`customers/123/campaignBudgets/101\`
- Ad (composite): \`customers/123/adGroupAds/{adGroupId}~{adId}\`
- Keyword (composite): \`customers/123/adGroupCriteria/{adGroupId}~{criterionId}\`
- Asset: \`customers/123/assets/202\`

## Creation Order

Full campaign structure (top-down):

1. **List accessible accounts** — \`gads_list_accounts\` to find your customer ID
2. **Campaign Budget** — create budget first (\`amountMicros\` = daily budget in micros)
3. **Campaign** — reference budget via \`campaignBudget\` resource name field
4. **Ad Group(s)** — reference campaign via \`campaign\` resource name field
5. **Keyword(s)** — reference ad group via \`adGroup\` resource name field
6. **Ad(s)** — reference ad group via \`adGroup\` resource name field
7. **Asset(s)** — optional, create then link via CampaignAsset or AdGroupAsset

## Key Differences from Other Platforms

| Feature | Google Ads | DV360 | TTD |
|---------|-----------|-------|-----|
| **Budget model** | Separate CampaignBudget entity | Budget in campaign object | Budget in campaign + ad group |
| **Query language** | GAQL (SQL-like) | REST GET with filters | POST to /query endpoints |
| **Mutations** | :mutate with operations[] | REST PUT/PATCH | REST POST/PUT |
| **Update mask** | Required on update | Required on update | Full PUT (no mask) |
| **Status values** | ENABLED/PAUSED/REMOVED | ACTIVE/PAUSED/DRAFT/ARCHIVED | Available/Paused/Archived |
| **ID format** | Numeric strings | Numeric strings | Alphanumeric strings |
| **Currency** | Micros (÷1,000,000) | Standard units | Standard units |

## Deletion / Removal Order

Remove bottom-up to avoid dependency errors:

1. **Keywords** and **Ads** first
2. **Ad Groups**
3. **Campaigns**
4. **Campaign Budgets** (only if not shared)
5. **Assets** (only if not linked to campaigns/ad groups)

Note: In Google Ads, "remove" sets status to REMOVED. Entities cannot be un-removed.

## Available Tools Summary

| Tool | Purpose | Read/Write |
|------|---------|:----------:|
| \`gads_gaql_search\` | Execute arbitrary GAQL queries | Read |
| \`gads_list_accounts\` | List accessible customer accounts | Read |
| \`gads_get_entity\` | Get single entity by type/ID | Read |
| \`gads_list_entities\` | List entities with filters | Read |
| \`gads_create_entity\` | Create via :mutate API | Write |
| \`gads_update_entity\` | Update with updateMask | Write |
| \`gads_remove_entity\` | Remove via :mutate API | Write |
| \`gads_bulk_mutate\` | Multi-operation mutate | Write |
| \`gads_bulk_update_status\` | Batch enable/pause/remove | Write |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://gads",
  name: "Google Ads Entity Hierarchy",
  description:
    "Parent-child relationships between Google Ads entities, API patterns, creation/deletion ordering, and platform differences",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
