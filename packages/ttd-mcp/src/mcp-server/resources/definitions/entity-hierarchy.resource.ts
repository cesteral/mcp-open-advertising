/**
 * TTD Entity Hierarchy Resource
 *
 * Documents parent-child relationships and required parent IDs for TTD entities.
 */
import type { Resource } from "../types.js";
import {
  getEntityConfig,
  getSupportedEntityTypes,
  type ParentIdKey,
} from "../../tools/utils/entity-mapping.js";

let cachedContent: string | undefined;

const parentFieldLabels: Record<ParentIdKey, string> = {
  advertiserId: "AdvertiserId",
  campaignId: "CampaignId",
  adGroupId: "AdGroupId",
};

function formatParentIds(parentIds: ParentIdKey[]): string {
  if (parentIds.length === 0) {
    return "_(none - scoped to Partner)_";
  }
  return parentIds.map((id) => `\`${parentFieldLabels[id]}\``).join(", ");
}

function buildEntityRows(): string {
  return getSupportedEntityTypes()
    .map((entityType) => {
      const config = getEntityConfig(entityType);
      const supportsBulk = config.supportsBulk ? "✓" : "";
      const supportsArchive = config.supportsArchive ? "✓" : "";
      return `| **${entityType}** | ${formatParentIds(config.parentIds)} | \`${config.idField}\` | \`${config.apiPath}\` | \`${config.queryPath}\` | ${supportsBulk} | ${supportsArchive} |`;
    })
    .join("\n");
}

function formatEntityHierarchyMarkdown(): string {
  return `# TTD Entity Hierarchy

## Relationship Diagram

\`\`\`
Partner (your TTD seat)
  └── Advertiser
        ├── Campaign
        │     └── Ad Group
        │           ├── Ad
        │           └── (references: Creatives, Bid Lists, Deals)
        ├── Creative (reusable across ads)
        ├── Site List (include/exclude inventory)
        ├── Deal (PMP/PG contracts)
        ├── Conversion Tracker (tracking tags)
        └── Bid List (dimensional bid adjustments)
\`\`\`

## Entity Types (9 total)

| Entity Type | Required Parent IDs | ID Field | API Path | Query Path | Supports Bulk | Supports Archive |
|-------------|--------------------:|----------|----------|------------|:---:|:---:|
${buildEntityRows()}

## Key Relationships

### Core Hierarchy: Advertiser → Campaign → Ad Group → Ad
- A campaign belongs to exactly one advertiser (inherits currency).
- An ad group belongs to exactly one campaign (inherits flight dates).
- An ad belongs to exactly one ad group (inherits targeting/bidding).

### Ancillary Entities (all belong to an Advertiser)
- **Creatives** are reusable — referenced by ads via \`CreativeIds\`.
- **Site Lists** are referenced by ad groups via \`SiteTargeting\`.
- **Deals** are referenced by ad groups via \`ContractTargeting\`.
- **Conversion Trackers** feed into campaign/ad group ROI optimization.
- **Bid Lists** are associated with ad groups via \`AssociatedBidLists\`.

## Creation Order

Full campaign structure (top-down):

1. **Advertiser** — usually pre-exists; verify with \`ttd_get_entity\`
2. **Creative(s)** — create before ads that reference them
3. **Conversion Tracker(s)** — create if using CPA/ROAS goals
4. **Site List(s)** — create if using inventory targeting
5. **Deal(s)** — create if using PMP/PG inventory
6. **Bid List(s)** — create if using dimensional bid adjustments
7. **Campaign** — requires \`AdvertiserId\`
8. **Ad Group(s)** — requires \`CampaignId\` + configure targeting/bidding
9. **Ad(s)** — requires \`AdGroupId\` + \`CreativeIds\`

## Deletion / Archive Order

Delete bottom-up to avoid orphan references:

1. **Ads** first
2. **Ad Groups** (use \`ttd_archive_entities\` for batch soft-delete)
3. **Campaigns** (use \`ttd_archive_entities\` for batch soft-delete)
4. Ancillary entities (creatives, site lists, deals, trackers, bid lists)
5. _(Advertisers are rarely deleted)_

## Query Patterns

List queries use POST to scoped query endpoints. Each endpoint is scoped to a parent entity type:

| Query | Endpoint | Required Filter | Example |
|-------|----------|----------------|---------|
| Advertisers for partner | \`/advertiser/query/partner\` | \`PartnerId\` (auto-set) | _automatic_ |
| Campaigns for advertiser | \`/campaign/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |
| Ad Groups for campaign | \`/adgroup/query/campaign\` | \`CampaignId\` | \`{ "CampaignId": "camp456" }\` |
| Ads for ad group | \`/ad/query/adgroup\` | \`AdGroupId\` | \`{ "AdGroupId": "ag789" }\` |
| Creatives for advertiser | \`/creative/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |
| Site lists for advertiser | \`/sitelist/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |
| Deals for advertiser | \`/deal/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |
| Trackers for advertiser | \`/tracking/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |
| Bid lists for advertiser | \`/bidlist/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`ttd_list_entities\` | List/query entities | |
| \`ttd_get_entity\` | Get single entity | |
| \`ttd_create_entity\` | Create single entity | |
| \`ttd_update_entity\` | Update single entity (PUT) | |
| \`ttd_delete_entity\` | Delete single entity | |
| \`ttd_bulk_create_entities\` | Batch create (campaigns/ad groups) | ✓ |
| \`ttd_bulk_update_entities\` | Batch update (campaigns/ad groups) | ✓ |
| \`ttd_bulk_update_status\` | Batch pause/resume/archive | ✓ |
| \`ttd_archive_entities\` | Batch archive (soft-delete) | ✓ |
| \`ttd_adjust_bids\` | Batch bid adjustments | ✓ |
| \`ttd_validate_entity\` | Test entity payload (NOT dry-run — creates/updates on success) | |
| \`ttd_graphql_query\` | GraphQL query/mutation passthrough | |
| \`ttd_graphql_query_bulk\` | Submit bulk GraphQL query job | ✓ |
| \`ttd_graphql_mutation_bulk\` | Submit bulk GraphQL mutation job (non-cancelable) | ✓ |
| \`ttd_graphql_bulk_job\` | Check bulk job status / get result URL | |
| \`ttd_graphql_cancel_bulk_job\` | Cancel bulk query job (not mutations) | |
| \`ttd_get_report\` | Generate async report | |
| \`ttd_download_report\` | Download & parse report CSV | |

## GraphQL Bulk Constraints

| Constraint | Limit |
|-----------|-------|
| Max mutation inputs per job | 1,000 |
| Max lexical tokens per query/mutation string | 15,000 (~60,000 chars) |
| Mutation jobs cancelable? | **No** — non-cancelable once submitted |
| Result URL expiry | 1 hour after job completion |
| Max active jobs per partner | 10 |
| Max queued jobs per partner | 20 |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://all",
  name: "TTD Entity Hierarchy",
  description:
    "Parent-child relationships between TTD entities, required parent IDs, and creation/deletion ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
