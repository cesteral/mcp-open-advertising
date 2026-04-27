// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const crossPlatformPerformancePrompt: Prompt = {
  name: "cross_platform_performance_comparison",
  description: "Cross-platform performance comparison and budget reallocation guide",
  arguments: [
    {
      name: "dateRange",
      description: "Date range (e.g., LAST_7_DAYS, LAST_30_DAYS, or custom dates)",
      required: false,
    },
  ],
};

export function getCrossPlatformPerformanceMessage(args?: Record<string, string>): string {
  const dateRange = args?.dateRange || "LAST_7_DAYS";
  return `# Cross-Platform Performance Comparison

## Date Range: ${dateRange}

## Step 1: Gather Metrics Per Platform

### DV360 (via dbm-mcp)
\`\`\`json
{ "tool": "dbm_get_performance_metrics", "params": { "campaignId": "CID", "advertiserId": "AID", "dateRange": "${dateRange}" } }
\`\`\`

### Google Ads (via gads-mcp)
\`\`\`json
{ "tool": "gads_get_insights", "params": { "customerId": "CID", "entityType": "campaign", "dateRange": "${dateRange}" } }
\`\`\`

### Meta (via meta-mcp)
\`\`\`json
{ "tool": "meta_get_insights", "params": { "entityId": "CAMPAIGN_ID", "datePreset": "last_7d", "fields": ["impressions", "clicks", "spend", "actions"] } }
\`\`\`

### SA360 (via sa360-mcp -- cross-engine unified)
\`\`\`json
{ "tool": "sa360_get_insights", "params": { "customerId": "CID", "entityType": "campaign", "dateRange": "${dateRange}" } }
\`\`\`

## Step 2: Normalize Metrics

| Metric | Formula |
|--------|---------|
| CPM | (Spend / Impressions) x 1000 |
| CPC | Spend / Clicks |
| CTR | Clicks / Impressions |
| CPA | Spend / Conversions |
| ROAS | Revenue / Spend |

**Budget unit conversion**: DV360/GAds/SA360 use micros (divide by 1,000,000), Meta/LinkedIn use cents (divide by 100), TTD/TikTok use dollars.

## Step 3: Compare

| Platform | Impressions | Clicks | CTR | CPC | Conversions | CPA | ROAS |
|----------|-------------|--------|-----|-----|-------------|-----|------|
| DV360 | | | | | | | |
| Google Ads | | | | | | | |
| Meta | | | | | | | |
| SA360 (unified) | | | | | | | |

## Step 4: Reallocate Budget

- **Winners** (lowest CPA or highest ROAS): Increase budget 20-30%
- **Average**: Hold steady
- **Underperformers**: Reduce by 20-30% or pause
`;
}
