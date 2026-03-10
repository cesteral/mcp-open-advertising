/**
 * LinkedIn Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  return `# LinkedIn Ads Entity Hierarchy

## Relationship Diagram

\`\`\`
Ad Account (urn:li:sponsoredAccount:XXXXXXXXX)
  ├── Campaign Group (urn:li:sponsoredCampaignGroup:XXXXXXXXX)
  │     └── Campaign (urn:li:sponsoredCampaign:XXXXXXXXX)
  │           └── Creative (urn:li:sponsoredCreative:XXXXXXXXX)
  └── Conversion Rule (urn:li:conversion:XXXXXXXXX)
\`\`\`

## Entity Types (5 total)

| Entity Type | API Path | Display Name |
|-------------|----------|--------------|
| **adAccount** | \`/v2/adAccounts\` | Ad Account |
| **campaignGroup** | \`/v2/adCampaignGroups\` | Campaign Group |
| **campaign** | \`/v2/adCampaigns\` | Campaign |
| **creative** | \`/v2/adCreatives\` | Creative |
| **conversionRule** | \`/v2/conversions\` | Conversion Rule |

## Key Concepts

### LinkedIn URN IDs
All LinkedIn entity IDs are URNs (Uniform Resource Names):
- Ad Account: \`urn:li:sponsoredAccount:123456789\`
- Campaign Group: \`urn:li:sponsoredCampaignGroup:987654321\`
- Campaign: \`urn:li:sponsoredCampaign:111222333\`
- Creative: \`urn:li:sponsoredCreative:444555666\`
- Conversion Rule: \`urn:li:conversion:777888999\`

URNs must be URL-encoded when used in API paths:
\`urn:li:sponsoredAccount:123\` → \`urn%3Ali%3AsponssoredAccount%3A123\`

### Core Hierarchy: Account → Campaign Group → Campaign → Creative
- A campaign group organizes campaigns (like Facebook campaign)
- A campaign contains targeting, bidding, and budget (like Facebook ad set)
- A creative is the ad content associated with a campaign

## Creation Order

1. **Ad Account** — pre-exists; use \`linkedin_list_ad_accounts\` to find URN
2. **Conversion Rule(s)** — optional; create if tracking conversions
3. **Campaign Group** — requires \`account\` URN, \`name\`, \`status\`
4. **Campaign(s)** — requires \`campaignGroup\` URN, \`account\` URN, \`type\`, \`objectiveType\`
5. **Creative(s)** — requires \`campaign\` URN, \`reference\` content URN

## LinkedIn API Patterns

### Create: POST /v2/{entityPath}
Body is JSON. Response contains the new entity URN.

### Read: GET /v2/{entityPath}/{encodedUrn}
URN must be URL-encoded in path.

### Update: POST /v2/{entityPath}/{encodedUrn} with X-Restli-Method: PARTIAL_UPDATE
Body: \`{ "patch": { "$set": { ...fields } } }\`

### Delete: DELETE /v2/{entityPath}/{encodedUrn}

### List: GET /v2/{entityPath}?q=search&accounts[0]={urn}&start={n}&count={n}
Offset-based pagination via \`start\` and \`count\` parameters.
Response contains \`elements\` array and \`paging\` object.

## Required Headers (All Requests)

| Header | Value |
|--------|-------|
| Authorization | Bearer {access_token} |
| LinkedIn-Version | 202409 |
| X-Restli-Protocol-Version | 2.0.0 |

## Available Tools Summary

| Tool | Purpose | Batch? |
|------|---------|--------|
| \`linkedin_list_entities\` | List entities with offset pagination | |
| \`linkedin_get_entity\` | Get single entity by URN | |
| \`linkedin_create_entity\` | Create single entity | |
| \`linkedin_update_entity\` | Update single entity (PATCH) | |
| \`linkedin_delete_entity\` | Delete single entity | |
| \`linkedin_list_ad_accounts\` | List accessible ad accounts | |
| \`linkedin_get_analytics\` | Get analytics metrics | |
| \`linkedin_get_analytics_breakdowns\` | Analytics with multiple pivots | |
| \`linkedin_bulk_update_status\` | Batch status update | ✓ |
| \`linkedin_bulk_create_entities\` | Batch entity creation | ✓ |
| \`linkedin_bulk_update_entities\` | Batch entity updates | ✓ |
| \`linkedin_adjust_bids\` | Batch adjust campaign bids | ✓ |
| \`linkedin_search_targeting\` | Search targeting facets | |
| \`linkedin_get_targeting_options\` | Browse targeting categories | |
| \`linkedin_duplicate_entity\` | Copy entity (read + create) | |
| \`linkedin_get_delivery_forecast\` | Audience size estimation | |
| \`linkedin_get_ad_preview\` | Ad creative preview | |
| \`linkedin_validate_entity\` | Client-side payload validation | |

## Budget Format

LinkedIn budgets use a CurrencyAmount object:
\`\`\`json
{ "amount": "50.00", "currencyCode": "USD" }
\`\`\`

## Campaign Types (type field)

| Type | Description |
|------|-------------|
| SPONSORED_UPDATES | Sponsored content in the feed |
| TEXT_AD | Text-based display ads |
| DYNAMIC | Dynamic personalized ads |
| SPONSORED_INMAILS | InMail / Message Ads |
| VIDEO | Video ads |
| CAROUSEL | Carousel ads |

## Objective Types (objectiveType field)

| Objective | Use Case |
|-----------|----------|
| BRAND_AWARENESS | Maximize reach and impressions |
| WEBSITE_TRAFFIC | Drive clicks to website |
| WEBSITE_CONVERSIONS | Optimize for conversion events |
| LEAD_GENERATION | LinkedIn Lead Gen Forms |
| ENGAGEMENT | Increase social engagement |
| VIDEO_VIEWS | Maximize video completions |
| TALENT_LEADS | Talent solution objectives |
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://linkedin/all",
  name: "LinkedIn Ads Entity Hierarchy",
  description:
    "Parent-child relationships between LinkedIn Ads entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
