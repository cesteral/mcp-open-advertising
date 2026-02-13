/**
 * TTD Entity Hierarchy Resource
 *
 * Documents parent-child relationships and required parent IDs for TTD entities.
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# TTD Entity Hierarchy

## Relationship Diagram

\`\`\`
Partner (your TTD seat)
  └── Advertiser
        ├── Campaign
        │     └── Ad Group
        │           └── Ad
        └── (Tracking Tags, Audiences, etc.)
\`\`\`

## Parent ID Requirements

| Entity Type | Required Parent IDs | ID Field | API Path |
|-------------|--------------------:|----------|----------|
| **Advertiser** | _(none — scoped to Partner)_ | \`AdvertiserId\` | \`/advertiser\` |
| **Campaign** | \`AdvertiserId\` | \`CampaignId\` | \`/campaign\` |
| **Ad Group** | \`AdvertiserId\`, \`CampaignId\` (in payload) | \`AdGroupId\` | \`/adgroup\` |
| **Ad** | \`AdvertiserId\`, \`AdGroupId\` (in payload) | \`AdId\` | \`/ad\` |

## Key Relationships

### Advertiser → Campaign
- A campaign belongs to exactly one advertiser.
- Set \`AdvertiserId\` in the campaign creation payload.
- Campaigns inherit the advertiser's currency.

### Campaign → Ad Group
- An ad group belongs to exactly one campaign.
- Set \`CampaignId\` in the ad group creation payload.
- Ad groups inherit campaign flight dates as boundaries.

### Ad Group → Ad
- An ad belongs to exactly one ad group.
- Set \`AdGroupId\` in the ad creation payload.
- The ad inherits the ad group's targeting and bid settings.

## Creation Order

When building a full campaign structure, create entities top-down:

1. **Advertiser** — usually pre-exists; verify with \`ttd_get_entity\`
2. **Campaign** — requires \`AdvertiserId\`
3. **Ad Group** — requires \`CampaignId\` and \`AdvertiserId\`
4. **Ad** — requires \`AdGroupId\` and \`AdvertiserId\`

## Deletion Order

Delete bottom-up to avoid orphan references:

1. **Ads** first
2. **Ad Groups**
3. **Campaigns**
4. _(Advertisers are rarely deleted)_

## Query Patterns

All list queries use POST to \`/{entity}/query\` with filter payloads:

| Query | Filter Field | Example |
|-------|-------------|---------|
| Campaigns for an advertiser | \`AdvertiserIds\` | \`{ "AdvertiserIds": ["abc123"] }\` |
| Ad Groups for a campaign | \`CampaignId\` | \`{ "CampaignId": "camp456" }\` |
| Ads for an ad group | \`AdGroupId\` | \`{ "AdGroupId": "ag789" }\` |
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
