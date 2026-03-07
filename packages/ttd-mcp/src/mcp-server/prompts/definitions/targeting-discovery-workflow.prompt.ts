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

export function getTtdTargetingDiscoveryWorkflowMessage(
  args?: Record<string, string>
): string {
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

---

## Step 1: Inventory Targeting — Site Lists

### Browse Existing Site Lists

\`\`\`
Tool: ttd_list_entities
Input: {
  "entityType": "siteList",
  "advertiserId": "${advertiserId}"
}
\`\`\`

### Create a New Site List (Allowlist)

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "siteList",
  "data": {
    "SiteListName": "Premium News Publishers",
    "AdvertiserId": "${advertiserId}",
    "SiteListType": "Whitelist",
    "Sites": ["nytimes.com", "bbc.com", "reuters.com", "theguardian.com"]
  }
}
\`\`\`

**Save**: Note the returned \`SiteListId\` — you'll reference it in the ad group.

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

To bid differently by region (not just include/exclude):

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "bidList",
  "data": {
    "BidListName": "US Regional Bid Modifiers",
    "AdvertiserId": "${advertiserId}",
    "BidListDimension": "GeoRegion",
    "BidListAdjustmentType": "PercentageAdjustment",
    "BidListEntries": [
      { "DimensionValue": "US-CA", "AdjustmentValue": 50, "IsEnabled": true },
      { "DimensionValue": "US-NY", "AdjustmentValue": 30, "IsEnabled": true },
      { "DimensionValue": "US-TX", "AdjustmentValue": -20, "IsEnabled": true }
    ]
  }
}
\`\`\`

---

## Step 3: Audience Targeting

### Browse Available Deals (PMP)

\`\`\`
Tool: ttd_list_entities
Input: {
  "entityType": "deal",
  "advertiserId": "${advertiserId}"
}
\`\`\`

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

### Browse Bid Lists

\`\`\`
Tool: ttd_list_entities
Input: {
  "entityType": "bidList",
  "advertiserId": "${advertiserId}"
}
\`\`\`

---

## Step 4: Private Marketplace (PMP) Deals

### Create a Deal

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "deal",
  "data": {
    "DealName": "Premium Video PMP",
    "AdvertiserId": "${advertiserId}",
    "DealId": "publisher-deal-id-123",
    "SupplyVendor": "Xandr",
    "CPMInUSD": 12.00
  }
}
\`\`\`

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
        "PacingMode": "PaceEvenly"
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
- \`entity-schema://siteList\` — Site list fields and site format
- \`entity-schema://bidList\` — Bid list dimension options and entry format
- \`entity-schema://deal\` — Deal fields and supply vendor codes
- \`entity-examples://adGroup\` — Example ad groups with common targeting patterns
`;
}
