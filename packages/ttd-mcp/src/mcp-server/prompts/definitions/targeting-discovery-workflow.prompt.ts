// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * TTD Targeting Discovery Workflow Prompt
 *
 * Guides AI agents through understanding and configuring TTD's targeting options
 * for ad groups: site lists, bid lists, geo targeting, audience segments, and deals.
 */
export const ttdTargetingDiscoveryWorkflowPrompt: Prompt = {
  name: "ttd_targeting_discovery_workflow",
  description:
    "Step-by-step guide for researching and configuring TTD ad group targeting — covers site lists, bid lists, geo segments, audience targeting, and private marketplace deals.",
  arguments: [
    {
      name: "advertiserId",
      description: "TTD Advertiser ID",
      required: true,
    },
    {
      name: "goal",
      description:
        "Targeting goal: 'site' (inventory targeting), 'audience' (segment targeting), 'geo' (geographic targeting), or 'deal' (PMP deals). Default: audience",
      required: false,
    },
  ],
};

export function getTtdTargetingDiscoveryWorkflowMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const goal = args?.goal || "audience";

  return `# TTD Targeting Discovery Workflow

Advertiser ID: \`${advertiserId}\`
Goal: \`${goal}\`

---

## Overview

TTD targeting is configured at the **ad group level** via \`RTBAttributes\`. Key targeting mechanisms:

| Targeting Type | Mechanism | Set Via |
|---------------|-----------|---------|
| **Inventory** | Site lists (allowlists/blocklists) | \`SiteListId\` in ad group |
| **Audience** | Third-party segments, data providers | \`AudienceId\` in ad group |
| **Geography** | Country/region/city codes | \`GeoSegments\` in ad group |
| **Deals** | PMP/private deals | \`DealId\` in ad group |
| **Bid Modifiers** | Dimension-level adjustments | Bid lists attached to ad group |

> Fetch \`entity-schema://adGroup\` for the full \`RTBAttributes\` targeting field reference.

**What the tools cover.** \`ttd_create_entity\` and \`ttd_list_entities\` accept only the entity types \`advertiser\`, \`campaign\`, \`adGroup\`, \`creative\` and \`conversionTracker\`. Site lists, bid lists and deals are not among them:

| Object | Tool |
|--------|------|
| Bid lists | \`ttd_manage_bid_list\` (one, by GraphQL) and \`ttd_bulk_manage_bid_lists\` (up to 50) |
| Site lists | None. Attach an existing \`SiteListId\` to the ad group |
| Deals | None. Attach an existing \`DealId\` to the ad group |

Never call \`ttd_create_entity\` or \`ttd_list_entities\` with \`siteList\`, \`bidList\` or \`deal\`: input validation rejects them.

---

## Step 1: Inventory Targeting — Site Lists

No tool here creates or lists site lists. Use a site list that already exists in TTD:

- Ask the user for its \`SiteListId\`, or
- Read one from an ad group that already uses it: \`ttd_get_entity\` with \`{ "entityType": "adGroup", "entityId": "{AdGroupId}" }\`, then look in \`RTBAttributes\`.

If the user needs a new site list, tell them it has to be created outside this server (for example in the TTD UI).

### Site List Types

| Type | Effect |
|------|--------|
| \`Whitelist\` | Only bid on these sites |
| \`Blacklist\` | Exclude these sites, bid on all others |

### Attach Site List to Ad Group

Include in \`RTBAttributes\` when creating/updating an ad group:

\`\`\`
"RTBAttributes": {
  "SiteLists": [{ "SiteListId": "{SiteListId}", "SiteListType": "Whitelist" }],
  "BaseBidCPM": { "Amount": 5.00, "CurrencyCode": "USD" }
}
\`\`\`

---

## Step 2: Geographic Targeting

TTD uses ISO country codes and region identifiers for geo targeting.

### Common Geo Codes

| Code | Region |
|------|--------|
| \`USA\` | United States |
| \`GBR\` | United Kingdom |
| \`DEU\` | Germany |
| \`FRA\` | France |
| \`AUS\` | Australia |
| \`US-CA\` | California, US |
| \`US-NY\` | New York, US |

### Apply Geo Targeting in Ad Group

\`\`\`
"RTBAttributes": {
  "GeoSegments": ["USA", "GBR"],
  "BaseBidCPM": { "Amount": 5.00, "CurrencyCode": "USD" }
}
\`\`\`

### Geo Bid Adjustments via Bid Lists

To bid differently by region (not just include/exclude), create a bid list with \`ttd_manage_bid_list\`. It calls TTD's GraphQL \`bidListCreate\` mutation, so \`data\` is a \`BidListCreateInput\` object, not the retired REST shape (\`BidListName\`, \`BidListEntries\`). This server does not document that input's fields; take them from TTD's GraphQL schema documentation. Preview it first:

\`\`\`
Tool: ttd_manage_bid_list
Input: {
  "operation": "create",
  "data": { /* BidListCreateInput for advertiser ${advertiserId} */ },
  "dry_run": true
}
\`\`\`

Then run it again without \`dry_run\`. Note the returned bid list \`id\`.

---

## Step 3: Audience Targeting

### Bid Lists for Audience Signals

Bid lists support several targeting dimensions:

| Dimension | Use Case |
|-----------|----------|
| \`GeoRegion\` | Region-level bid adjustments |
| \`DeviceType\` | Mobile, desktop, CTV |
| \`Browser\` | Chrome, Safari, Firefox |
| \`OS\` | iOS, Android, Windows |
| \`DealId\` | Per-deal bid modifiers |
| \`SiteId\` | Per-site bid modifiers |

### Read Bid Lists

No tool lists bid lists. Read one by ID:

\`\`\`
Tool: ttd_manage_bid_list
Input: {
  "operation": "get",
  "bidListId": "{BidListId}",
  "selection": "id name"
}
\`\`\`

To read up to 50 at once, use \`ttd_bulk_manage_bid_lists\` with \`operation: "batch_get"\` and \`bidListIds\`.

---

## Step 4: Private Marketplace (PMP) Deals

No tool here creates or lists deals. Ask the user for the \`DealId\` of a deal that already exists in TTD.

### Attach Deal to Ad Group

\`\`\`
"RTBAttributes": {
  "Deals": [{ "DealId": "{DealId}" }],
  "BaseBidCPM": { "Amount": 12.00, "CurrencyCode": "USD" }
}
\`\`\`

---

## Step 5: GraphQL Targeting Discovery

TTD's GraphQL API offers richer targeting discovery capabilities:

\`\`\`
Tool: ttd_graphql_query
Input: {
  "query": "{ availableSegments(advertiserId: \\"${advertiserId}\\") { segmentId name description estimatedReach } }",
  "variables": {}
}
\`\`\`

---

## Step 6: Assemble the Ad Group Targeting

Combine your targeting inputs into the ad group \`RTBAttributes\`:

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "adGroup",
  "data": {
    "AdGroupName": "Brand - US Tech Decision Makers",
    "CampaignId": "{CampaignId}",
    "AdvertiserId": "${advertiserId}",
    "RTBAttributes": {
      "BudgetSettings": {
        "DailyBudget": { "Amount": 500, "CurrencyCode": "USD" },
        "PacingMode": "PaceAhead"
      },
      "BaseBidCPM": { "Amount": 5.00, "CurrencyCode": "USD" },
      "MaxBidCPM": { "Amount": 12.00, "CurrencyCode": "USD" },
      "GeoSegments": ["USA"],
      "SiteLists": [{ "SiteListId": "{SiteListId}", "SiteListType": "Whitelist" }],
      "BidLists": [{ "BidListId": "{BidListId}" }]
    }
  }
}
\`\`\`

---

## Related Resources

- \`entity-schema://adGroup\` — Full RTBAttributes targeting field reference
- \`graphql-reference://ttd\` — GraphQL query and mutation patterns
- \`entity-examples://adGroup\` — Example ad groups with common targeting patterns
`;
}
