// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const queryLanguageWorkflowPrompt: Prompt = {
  name: "sa360_query_language_workflow",
  description: "Guide for writing SA360 query language queries",
  arguments: [
    {
      name: "customerId",
      description: "SA360 Customer ID",
      required: true,
    },
  ],
};

export function getQueryLanguageWorkflowMessage(
  args?: Record<string, string>
): string {
  const customerId = args?.customerId || "{customerId}";
  return `# SA360 Query Language Workflow

## Customer ID: ${customerId}

## Step 1: Discover Available Fields

\`\`\`json
{
  "tool": "sa360_search_fields",
  "params": {
    "resourceType": "campaign"
  }
}
\`\`\`

## Step 2: Write a Query

SA360 uses a SQL-like query language:

\`\`\`json
{
  "tool": "sa360_search",
  "params": {
    "customerId": "${customerId}",
    "query": "SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC"
  }
}
\`\`\`

## Query Syntax

\`\`\`sql
SELECT resource.field, metrics.field, segments.field
FROM resource_type
WHERE conditions
ORDER BY field [ASC|DESC]
LIMIT n
\`\`\`

## Key Resources

| Resource | Description |
|----------|-------------|
| customer | Account-level data |
| campaign | Campaign entities |
| ad_group | Ad group entities |
| ad_group_ad | Ad entities |
| ad_group_criterion | Keywords, audiences |
| campaign_criterion | Campaign-level targeting |
| bidding_strategy | Bidding strategies |
| conversion_action | Conversion definitions |

## Date Filtering

| Clause | Example |
|--------|---------|
| DURING | \`segments.date DURING LAST_7_DAYS\` |
| BETWEEN | \`segments.date BETWEEN '2026-01-01' AND '2026-01-31'\` |
| Presets | LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, TODAY, YESTERDAY |

## Common Metrics

| Metric | Description |
|--------|-------------|
| metrics.impressions | Total impressions |
| metrics.clicks | Total clicks |
| metrics.cost_micros | Spend in micros (divide by 1,000,000 for dollars) |
| metrics.conversions | Total conversions |
| metrics.conversions_value | Conversion value |
| metrics.ctr | Click-through rate |
| metrics.average_cpc | Average CPC in micros |

## Step 3: Use Convenience Tools

For common patterns, use the higher-level tools:

\`\`\`json
{
  "tool": "sa360_list_entities",
  "params": {
    "customerId": "${customerId}",
    "entityType": "campaign",
    "filters": "campaign.status = 'ENABLED'"
  }
}
\`\`\`

\`\`\`json
{
  "tool": "sa360_get_insights",
  "params": {
    "customerId": "${customerId}",
    "entityType": "campaign",
    "dateRange": "LAST_30_DAYS"
  }
}
\`\`\`

## Gotchas

| Issue | Solution |
|-------|----------|
| cost_micros not dollars | Divide by 1,000,000 for dollars |
| Field not selectable | Use \`sa360_search_fields\` to verify field availability |
| Cross-resource joins | SA360 supports implicit joins via resource hierarchy |
| Pagination | Use pageToken for large result sets |
`;
}