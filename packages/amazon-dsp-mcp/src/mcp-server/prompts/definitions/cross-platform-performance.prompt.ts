// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Cross-Platform Performance Comparison Prompt
 *
 * Guides AI agents through fetching, normalizing, and comparing performance
 * metrics across DV360, TTD, Google Ads, and Meta to inform budget allocation.
 */
export const crossPlatformPerformancePrompt: Prompt = {
  name: "cross_platform_performance_comparison",
  description:
    "Guide for comparing campaign performance across DV360 (via dbm-mcp), The Trade Desk (ttd-mcp), Google Ads (gads-mcp), and Meta Ads (meta-mcp). Normalizes metrics, identifies top performers, and recommends budget reallocation.",
  arguments: [
    {
      name: "dateRange",
      description:
        "Date range for comparison (e.g., LAST_7_DAYS, LAST_30_DAYS, or custom YYYY-MM-DD format)",
      required: false,
    },
  ],
};

export function getCrossPlatformPerformanceMessage(
  args?: Record<string, string>,
): string {
  const dateRange = args?.dateRange || "LAST_7_DAYS";

  return `# Cross-Platform Performance Comparison

Date Range: \`${dateRange}\`

This workflow coordinates across multiple MCP servers to gather, normalize, and compare campaign performance. You must be connected to all relevant servers.

---

## Step 1: Gather Metrics from Each Platform

### DV360 (via dbm-mcp)

\`\`\`json
{
  "tool": "dbm_get_performance_metrics",
  "params": {
    "campaignId": "{dv360CampaignId}",
    "profileId": "{dv360AdvertiserId}",
    "dateRange": "${dateRange}"
  }
}
\`\`\`

Key metrics returned: impressions, clicks, spend, CPM, CTR, CPA, ROAS.

### The Trade Desk (via ttd-mcp)

\`\`\`json
{
  "tool": "ttd_get_report",
  "params": {
    "reportName": "Cross-Platform Comparison",
    "dateRange": "${dateRange}",
    "dimensions": ["CampaignId", "CampaignName"],
    "metrics": ["Impressions", "Clicks", "TotalCostAdvertiserCurrency", "Conversions", "Revenue"],
    "profileIds": ["{ttdAdvertiserId}"]
  }
}
\`\`\`

### Google Ads (via gads-mcp)

\`\`\`json
{
  "tool": "gads_get_insights",
  "params": {
    "customerId": "{gadsCustomerId}",
    "entityType": "campaign",
    "dateRange": "${dateRange}"
  }
}
\`\`\`

### Meta Ads (via meta-mcp)

\`\`\`json
{
  "tool": "meta_get_insights",
  "params": {
    "entityId": "{metaCampaignId}",
    "fields": ["impressions", "clicks", "spend", "cpm", "ctr", "cpc", "conversions", "cost_per_action_type"],
    "datePreset": "last_7d"
  }
}
\`\`\`

---

## Step 2: Normalize Metrics

Each platform reports metrics differently. Normalize to a common format:

| Metric | DV360 (dbm-mcp) | TTD (ttd-mcp) | Google Ads (gads-mcp) | Meta (meta-mcp) |
|--------|-----------------|---------------|----------------------|-----------------|
| **Spend** | USD (from report) | Advertiser currency | Micros (÷ 1,000,000) | Cents (÷ 100) |
| **CPM** | Calculated | Calculated | Micros (÷ 1,000,000) | Cents (÷ 100) |
| **CPC** | Calculated | Calculated | Micros (÷ 1,000,000) | Cents (÷ 100) |
| **CTR** | Ratio (0-1) | Ratio (0-1) | Ratio (0-1) | Percentage string |
| **Conversions** | Bid Manager metric | \`Conversions\` field | \`conversions\` metric | \`conversions\` field |

### Normalization formulas:

- **Google Ads micros → USD**: Divide by 1,000,000
- **Meta cents → USD**: Divide by 100
- **Meta CTR string → number**: Parse "1.23%" to 0.0123
- **CPM**: (Spend / Impressions) × 1,000
- **CTR**: Clicks / Impressions
- **CPA**: Spend / Conversions
- **ROAS**: Revenue / Spend

---

## Step 3: Compare in Normalized Table

Present results in a unified format:

| Platform | Campaign | Impressions | Clicks | CTR | Spend (USD) | CPM (USD) | CPA (USD) | ROAS |
|----------|----------|-------------|--------|-----|-------------|-----------|-----------|------|
| DV360 | {name} | {n} | {n} | {%} | \${n} | \${n} | \${n} | {n}x |
| TTD | {name} | {n} | {n} | {%} | \${n} | \${n} | \${n} | {n}x |
| Google Ads | {name} | {n} | {n} | {%} | \${n} | \${n} | \${n} | {n}x |
| Meta | {name} | {n} | {n} | {%} | \${n} | \${n} | \${n} | {n}x |

---

## Step 4: Identify Winners and Losers

Rank platforms by key efficiency metrics:

### By CPA (lower is better)
1. Best CPA platform → candidate for budget increase
2. Worst CPA platform → candidate for budget decrease or pause

### By ROAS (higher is better)
1. Best ROAS platform → highest return on investment
2. Worst ROAS platform → losing money if < 1.0

### By CPM (context-dependent)
- Low CPM + low CTR → cheap but ineffective (awareness only)
- High CPM + high CTR → expensive but effective (consider if CPA is good)

---

## Step 5: Recommend Budget Reallocation

Based on the comparison, suggest budget moves:

### Conservative Approach (low risk)
- Shift 10-15% of budget from worst performer to best performer
- Monitor for 1 week before making further changes

### Aggressive Approach (high confidence)
- Shift 25-30% of budget from worst performer to best performer
- Pause campaigns on platforms with ROAS < 0.5

### Execution

For each platform where budget changes are needed:

- **DV360**: Use \`dv360_update_entity\` (via dv360-mcp) to adjust IO/Line Item budgets
- **TTD**: Use \`ttd_update_entity\` (via ttd-mcp) to adjust campaign/ad group budgets
- **Google Ads**: Use \`gads_update_entity\` (via gads-mcp) to adjust campaign budgets
- **Meta**: Use \`meta_update_entity\` (via meta-mcp) to adjust campaign/ad set budgets

---

## Gotchas

- **Date ranges differ by platform**: DV360 uses Bid Manager presets (LAST_7_DAYS), TTD uses date strings, Google Ads uses date ranges in GAQL, Meta uses datePreset or timeRange. Align dates carefully.
- **Currency differences**: Ensure all platforms report in the same currency before comparing. TTD reports in advertiser currency, others in USD by default.
- **Attribution models differ**: Each platform attributes conversions differently. Cross-platform CPA comparisons are directional, not exact.
- **Data freshness varies**: Meta has up to 48-hour lag. DV360 reports are async. TTD and Google Ads are near-real-time. Compare data from the same time window.
- **Impression counting differs**: Viewability standards vary by platform. CPM comparisons should account for this.
- **Not all campaigns are comparable**: Only compare campaigns targeting similar audiences, geos, and objectives. A brand awareness campaign on DV360 shouldn't be compared with a direct response campaign on Google Ads.
`;
}