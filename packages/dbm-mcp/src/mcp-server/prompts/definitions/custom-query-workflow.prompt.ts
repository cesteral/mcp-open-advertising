// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Custom Query Workflow Prompt
 *
 * Step-by-step guide for building custom Bid Manager queries.
 */

import type { Prompt } from "./types.js";

export const customQueryWorkflowPrompt: Prompt = {
  name: "custom_query_workflow",
  description: "Step-by-step guide for building custom Bid Manager queries with the dbm_run_custom_query tool",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID to query",
      required: true,
    },
    {
      name: "queryGoal",
      description: "What you want to analyze (e.g., 'campaign performance', 'device breakdown', 'video metrics')",
      required: false,
    },
  ],
};

export function getCustomQueryWorkflowMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const queryGoal = args?.queryGoal || "campaign performance";

  return `# Custom Query Building Workflow

## Goal: ${queryGoal}

Follow these steps to build a custom Bid Manager query using the \`dbm_run_custom_query\` tool.

---

## Step 1: Determine Report Type

**Most common:** \`STANDARD\` for general delivery metrics.

Available types:
- \`STANDARD\` - Impressions, clicks, cost, conversions (most common)
- \`FLOODLIGHT\` - Conversion tracking with Floodlight data
- \`YOUTUBE\` - TrueView/YouTube-specific metrics
- \`REACH\` - Reach and frequency metrics

Fetch \`report-types://all\` for full details.

---

## Step 2: Choose Dimensions (groupBys)

Dimensions determine how results are broken down.

**Common groupBys for ${queryGoal}:**
- \`FILTER_DATE\` - Daily breakdown
- \`FILTER_MEDIA_PLAN\` - By campaign
- \`FILTER_LINE_ITEM\` - By line item
- \`FILTER_DEVICE_TYPE\` - By device
- \`FILTER_CREATIVE\` - By creative

Fetch \`filter-types://all\` for the complete list of ${278} available filters.

---

## Step 3: Select Metrics

Choose the metrics you want to measure.

**Common metrics for ${queryGoal}:**
- \`METRIC_IMPRESSIONS\` - Total impressions
- \`METRIC_CLICKS\` - Total clicks
- \`METRIC_CTR\` - Click-through rate
- \`METRIC_TOTAL_MEDIA_COST_ADVERTISER\` - Total spend
- \`METRIC_TOTAL_CONVERSIONS\` - Total conversions

Fetch \`metric-types://all\` for the complete list of ${100} available metrics.

---

## Step 4: Set Filters

Filters restrict the data to specific values.

**Required filter:**
\`\`\`json
{ "type": "FILTER_ADVERTISER", "value": "${advertiserId}" }
\`\`\`

**Optional filters:**
- \`FILTER_MEDIA_PLAN\` - Specific campaign(s)
- \`FILTER_LINE_ITEM\` - Specific line item(s)
- \`FILTER_DATE\` - Specific date range

---

## Step 5: Set Date Range

**Presets (recommended):**
- \`LAST_7_DAYS\` - Quick recent view
- \`LAST_30_DAYS\` - Monthly view
- \`MONTH_TO_DATE\` - Current month
- \`PREVIOUS_MONTH\` - Last complete month

**Custom dates:**
\`\`\`json
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31"
}
\`\`\`

---

## Step 6: Execute Query

Example query for ${queryGoal}:

\`\`\`json
{
  "reportType": "STANDARD",
  "groupBys": ["FILTER_DATE", "FILTER_MEDIA_PLAN"],
  "metrics": [
    "METRIC_IMPRESSIONS",
    "METRIC_CLICKS",
    "METRIC_CTR",
    "METRIC_TOTAL_MEDIA_COST_ADVERTISER"
  ],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "${advertiserId}" }
  ],
  "dateRange": {
    "preset": "LAST_7_DAYS"
  }
}
\`\`\`

---

## Validation Options

- \`strictValidation: true\` (default) - Validates all filter/metric names against known values
- \`strictValidation: false\` - Passes unknown values to API (useful for new API features)

---

## Output Options

- \`outputFormat: "structured"\` (default) - Returns JSON array of records
- \`outputFormat: "csv"\` - Returns raw CSV string

---

## Common Errors

| Error | Solution |
|-------|----------|
| "Unknown filter type" | Check spelling, fetch \`filter-types://all\` |
| "Unknown metric type" | Check spelling, fetch \`metric-types://all\` |
| "Report failed" | Check date range validity, reduce groupBys |
| "No data returned" | Verify advertiser ID, check filters aren't too restrictive |

---

## Next Steps

1. Run the query with \`dbm_run_custom_query\`
2. Analyze results
3. Refine groupBys/metrics based on findings
4. Use \`dbm_get_historical_metrics\` for trend analysis
`;
}