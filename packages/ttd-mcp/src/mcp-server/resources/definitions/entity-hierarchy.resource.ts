// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
  partnerId: "PartnerId",
};

function formatParentIds(parentIds: ParentIdKey[]): string {
  if (parentIds.length === 0) {
    return "_(none - partner-scoped)_";
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
        │     └── Ad Group (contains CreativeIds + targeting/bidding)
        ├── Creative (reusable across ad groups)
        └── Conversion Tracker (tracking tags)
\`\`\`

## REST Entity Types (5 total)

| Entity Type | Required Parent IDs | ID Field | API Path | Query Path | Supports Bulk | Supports Archive |
|-------------|--------------------:|----------|----------|------------|:---:|:---:|
${buildEntityRows()}

## GraphQL-Only Entities

The following entities have **no REST query endpoints** and must be managed via \`ttd_graphql_query\`:

- **Ads** — TTD has no standalone Ad entity. Ads are the combination of an Ad Group + Creative associations (\`CreativeIds\` on the ad group).
- **Publisher Lists (Site Lists)** — Managed via GraphQL \`bidListCreate\` mutation with \`PUBLISHER_LIST\` type.
- **Deals** — Managed via GraphQL \`targetableCommitments\` / \`targetableEndeavors\` on partner or advertiser objects.
- **Bid Lists** — Managed via GraphQL \`bidList\` query, \`bidListCreate\`/\`bidListUpdate\`/\`bidListDelete\` mutations.

## Key Relationships

### Core Hierarchy: Advertiser → Campaign → Ad Group
- A campaign belongs to exactly one advertiser (inherits currency).
- An ad group belongs to exactly one campaign (inherits flight dates).
- Ad groups contain \`CreativeIds\` to associate creatives (what other platforms call "ads").

### Ancillary Entities
- **Creatives** are reusable — referenced by ad groups via \`CreativeIds\` in \`RTBAttributes\`.
- **Conversion Trackers** feed into campaign/ad group ROI optimization.
- **Bid Lists** (GraphQL) are associated with ad groups via \`AssociatedBidLists\`.
- **Deals** (GraphQL) are referenced by ad groups via \`ContractTargeting\`.

## Creation Order

Full campaign structure (top-down):

1. **Advertiser** — usually pre-exists; verify with \`ttd_get_entity\`
2. **Creative(s)** — create before ad groups that reference them
3. **Conversion Tracker(s)** — create if using CPA/ROAS goals
4. **Bid List(s)** — create via \`ttd_graphql_query\` if using dimensional bid adjustments
5. **Deal(s)** — manage via \`ttd_graphql_query\` if using PMP/PG inventory
6. **Campaign** — requires \`AdvertiserId\`
7. **Ad Group(s)** — requires \`CampaignId\` + configure targeting/bidding + \`CreativeIds\`

## Deletion / Archive Order

Delete bottom-up to avoid orphan references:

1. **Ad Groups** (use \`ttd_archive_entities\` for batch soft-delete)
2. **Campaigns** (use \`ttd_archive_entities\` for batch soft-delete)
3. Ancillary entities (creatives, trackers; bid lists/deals via GraphQL)
4. _(Advertisers are rarely deleted)_

## Query Patterns

List queries use POST to scoped query endpoints. Each endpoint is scoped to a parent entity type:

| Query | Endpoint | Required Filter | Example |
|-------|----------|----------------|---------|
| Advertisers for partner | \`/advertiser/query/partner\` | \`PartnerId\` | \`{ "PartnerId": "partner123" }\` |
| Campaigns for advertiser | \`/campaign/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |
| Ad Groups for campaign | \`/adgroup/query/campaign\` | \`CampaignId\` | \`{ "CampaignId": "camp456" }\` |
| Creatives for advertiser | \`/creative/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |
| Trackers for advertiser | \`/trackingtag/query/advertiser\` | \`AdvertiserId\` | \`{ "AdvertiserId": "abc123" }\` |

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
| \`ttd_download_report\` | Download report CSV and return bounded views | |

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
