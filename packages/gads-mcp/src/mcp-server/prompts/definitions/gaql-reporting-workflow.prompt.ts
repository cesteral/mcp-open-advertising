// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * GAQL Reporting Workflow Prompt
 *
 * Guide for querying Google Ads data via GAQL (Google Ads Query Language).
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const gaqlReportingWorkflowPrompt: Prompt = {
  name: "gaql_reporting_workflow",
  description:
    "Step-by-step workflow for querying Google Ads performance data via GAQL, including common query patterns, field selection, and filtering",
  arguments: [
    {
      name: "customerId",
      description: "Google Ads Customer ID (without hyphens, e.g. 1234567890)",
      required: true,
    },
  ],
};

export function getGaqlReportingWorkflowMessage(
  args?: Record<string, string>
): string {
  const customerId = args?.customerId || "{customerId}";

  return `# GAQL Reporting Workflow

## Context
- Customer ID: \`${customerId}\`
- Query Language: GAQL (Google Ads Query Language)
- Tool: \`gads_gaql_search\`

GAQL queries are synchronous — results are returned directly in the response. Use the \`gads_gaql_search\` tool to execute any GAQL query.

---

## Step 1: Choose Your Report Goal

Before writing a query, decide what question you're answering:

| Goal | Resource | Key Fields |
|------|----------|------------|
| Campaign overview | \`campaign\` | \`campaign.name\`, \`campaign.status\`, \`metrics.impressions\`, \`metrics.clicks\`, \`metrics.cost_micros\` |
| Ad group performance | \`ad_group\` | \`ad_group.name\`, \`ad_group.status\`, \`metrics.impressions\`, \`metrics.ctr\`, \`metrics.average_cpc\` |
| Keyword analysis | \`keyword_view\` | \`ad_group_criterion.keyword.text\`, \`ad_group_criterion.keyword.match_type\`, \`metrics.impressions\`, \`metrics.conversions\` |
| Search terms | \`search_term_view\` | \`search_term_view.search_term\`, \`metrics.impressions\`, \`metrics.clicks\`, \`metrics.conversions\` |
| Device breakdown | \`campaign\` | \`segments.device\`, \`metrics.impressions\`, \`metrics.clicks\`, \`metrics.cost_micros\` |
| Daily trend | \`campaign\` | \`segments.date\`, \`metrics.impressions\`, \`metrics.cost_micros\` |
| Conversion tracking | \`campaign\` | \`metrics.conversions\`, \`metrics.conversions_value\`, \`metrics.cost_per_conversion\` |
| Budget utilization | \`campaign_budget\` | \`campaign_budget.amount_micros\`, \`campaign_budget.total_amount_micros\`, \`metrics.cost_micros\` |

---

## Step 2: Write the GAQL Query

### Query Structure
\`\`\`sql
SELECT
  resource.field1,
  resource.field2,
  metrics.metric1,
  segments.segment1
FROM resource
WHERE condition1
  AND condition2
ORDER BY metrics.metric1 DESC
LIMIT 100
\`\`\`

### Important GAQL Rules
- **No \`*\` wildcard** — you must list each field explicitly
- **Segments create row breakdowns** — adding \`segments.date\` gives one row per day per entity
- **Metrics are auto-aggregated** — \`metrics.cost_micros\` sums over the date range by default
- **cost_micros** — all monetary values are in micros (divide by 1,000,000 for actual currency)
- **Date filtering** — use \`segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'\`

---

## Step 3: Run the Query

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_7_DAYS ORDER BY metrics.impressions DESC"
}
\`\`\`

---

## Step 4: Interpret Results

- \`metrics.cost_micros\` ÷ 1,000,000 = actual cost in account currency
- \`metrics.ctr\` is already a fraction (0.05 = 5%)
- \`metrics.average_cpc\` is in micros
- Empty results may mean the date range has no data or filters are too restrictive

---

## Common Query Patterns

### Campaign Performance Summary
\`\`\`sql
SELECT
  campaign.name,
  campaign.status,
  metrics.impressions,
  metrics.clicks,
  metrics.ctr,
  metrics.cost_micros,
  metrics.conversions,
  metrics.cost_per_conversion
FROM campaign
WHERE campaign.status = 'ENABLED'
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.cost_micros DESC
\`\`\`

### Daily Spend Trend (for pacing)
\`\`\`sql
SELECT
  segments.date,
  campaign.name,
  metrics.cost_micros,
  metrics.impressions
FROM campaign
WHERE campaign.id = {campaignId}
  AND segments.date DURING LAST_14_DAYS
ORDER BY segments.date DESC
\`\`\`
Compare daily \`cost_micros / 1e6\` against \`campaign_budget.amount_micros / 1e6\`.

### Top Keywords by Conversions
\`\`\`sql
SELECT
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.cost_per_conversion
FROM keyword_view
WHERE campaign.id = {campaignId}
  AND segments.date DURING LAST_30_DAYS
  AND metrics.impressions > 0
ORDER BY metrics.conversions DESC
LIMIT 50
\`\`\`

### Search Terms Report
\`\`\`sql
SELECT
  search_term_view.search_term,
  campaign.name,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.cost_micros
FROM search_term_view
WHERE campaign.id = {campaignId}
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.impressions DESC
LIMIT 100
\`\`\`

---

## Date Range Shortcuts

| GAQL Keyword | Meaning |
|-------------|---------|
| \`TODAY\` | Current day |
| \`YESTERDAY\` | Previous day |
| \`LAST_7_DAYS\` | Past 7 days (not including today) |
| \`LAST_14_DAYS\` | Past 14 days |
| \`LAST_30_DAYS\` | Past 30 days |
| \`THIS_MONTH\` | Current month to date |
| \`LAST_MONTH\` | Previous full month |
| \`LAST_BUSINESS_WEEK\` | Mon–Fri of previous week |

For custom ranges: \`segments.date BETWEEN '2025-01-01' AND '2025-01-31'\`

---

## Tips

- Start simple — add fields incrementally to avoid field compatibility errors
- Some segments can't be combined with certain resources — GAQL will return a clear error
- Use \`gads_list_entities\` to discover entity IDs before querying with GAQL
- For large accounts, always add \`LIMIT\` to avoid timeouts
- Combine with write tools: analyze GAQL results, then use \`gads_update_entity\` to act on insights
`;
}