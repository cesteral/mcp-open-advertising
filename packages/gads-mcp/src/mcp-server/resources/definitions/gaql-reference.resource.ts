// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * GAQL Reference Resource
 *
 * Provides GAQL syntax guide and common query patterns for AI agents.
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function buildGaqlReferenceMarkdown(): string {
  return `# GAQL (Google Ads Query Language) Reference

## Query Structure

\`\`\`
SELECT field1, field2, metrics.metric1
FROM resource
WHERE condition1 AND condition2
ORDER BY field1 ASC
LIMIT 100
PARAMETERS include_drafts=true
\`\`\`

Only \`SELECT\` and \`FROM\` are required. All other clauses are optional.

## Field Types

| Type | Example | Description |
|------|---------|-------------|
| **Resource fields** | \`campaign.name\`, \`campaign.id\` | Entity attributes |
| **Segment fields** | \`segments.date\`, \`segments.device\` | Breakdowns/dimensions |
| **Metrics** | \`metrics.impressions\`, \`metrics.clicks\` | Performance data |

## Common Resources (FROM clause)

| Resource | Description | Key Fields |
|----------|-------------|------------|
| \`campaign\` | Campaign data | \`campaign.id\`, \`campaign.name\`, \`campaign.status\` |
| \`ad_group\` | Ad group data | \`ad_group.id\`, \`ad_group.name\`, \`ad_group.status\` |
| \`ad_group_ad\` | Ad data | \`ad_group_ad.ad.id\`, \`ad_group_ad.status\` |
| \`ad_group_criterion\` | Keywords/criteria | \`ad_group_criterion.keyword.text\`, \`ad_group_criterion.keyword.match_type\` |
| \`campaign_budget\` | Budget data | \`campaign_budget.amount_micros\`, \`campaign_budget.status\` |
| \`customer\` | Account data | \`customer.id\`, \`customer.descriptive_name\` |

## Common Metrics

| Metric | Description |
|--------|-------------|
| \`metrics.impressions\` | Number of impressions |
| \`metrics.clicks\` | Number of clicks |
| \`metrics.ctr\` | Click-through rate (clicks/impressions) |
| \`metrics.average_cpc\` | Average cost per click (micros) |
| \`metrics.average_cpm\` | Average cost per thousand impressions (micros) |
| \`metrics.cost_micros\` | Total cost (micros) |
| \`metrics.conversions\` | Number of conversions |
| \`metrics.conversions_value\` | Total conversion value |
| \`metrics.cost_per_conversion\` | Cost per conversion (micros) |
| \`metrics.video_views\` | Video views |
| \`metrics.video_view_rate\` | Video view rate |

## Common Segments

| Segment | Description |
|---------|-------------|
| \`segments.date\` | Date (YYYY-MM-DD) |
| \`segments.device\` | \`MOBILE\`, \`DESKTOP\`, \`TABLET\` |
| \`segments.ad_network_type\` | \`SEARCH\`, \`CONTENT\`, \`YOUTUBE_SEARCH\`, \`YOUTUBE_WATCH\` |
| \`segments.day_of_week\` | \`MONDAY\` through \`SUNDAY\` |
| \`segments.hour\` | Hour of day (0-23) |

## WHERE Operators

| Operator | Example | Description |
|----------|---------|-------------|
| \`=\` | \`campaign.status = 'ENABLED'\` | Equals |
| \`!=\` | \`campaign.status != 'REMOVED'\` | Not equals |
| \`>\`, \`<\`, \`>=\`, \`<=\` | \`metrics.impressions > 100\` | Comparison |
| \`IN\` | \`campaign.status IN ('ENABLED', 'PAUSED')\` | Set membership |
| \`NOT IN\` | \`campaign.status NOT IN ('REMOVED')\` | Set exclusion |
| \`LIKE\` | \`campaign.name LIKE '%brand%'\` | Pattern match |
| \`CONTAINS ANY\` | \`campaign.labels CONTAINS ANY ('label1')\` | Label matching |
| \`IS NULL\` / \`IS NOT NULL\` | \`campaign.end_date IS NOT NULL\` | Null check |
| \`BETWEEN\` | \`segments.date BETWEEN '2025-01-01' AND '2025-01-31'\` | Date range |
| \`DURING\` | \`segments.date DURING LAST_30_DAYS\` | Relative date range |

## DURING Predefined Ranges

\`TODAY\`, \`YESTERDAY\`, \`LAST_7_DAYS\`, \`LAST_14_DAYS\`, \`LAST_30_DAYS\`,
\`THIS_WEEK_MON_TODAY\`, \`THIS_MONTH\`, \`LAST_MONTH\`, \`THIS_QUARTER\`

## Example Queries

### Campaign Performance (Last 30 Days)
\`\`\`
SELECT campaign.name, campaign.status,
       metrics.impressions, metrics.clicks, metrics.ctr,
       metrics.cost_micros, metrics.conversions
FROM campaign
WHERE campaign.status != 'REMOVED'
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.cost_micros DESC
LIMIT 50
\`\`\`

### Active Ad Groups with Performance
\`\`\`
SELECT ad_group.name, ad_group.status, ad_group.campaign,
       metrics.impressions, metrics.clicks, metrics.average_cpc
FROM ad_group
WHERE ad_group.status = 'ENABLED'
  AND segments.date DURING LAST_7_DAYS
ORDER BY metrics.impressions DESC
\`\`\`

### Keywords with Low Quality Score
\`\`\`
SELECT ad_group_criterion.keyword.text,
       ad_group_criterion.keyword.match_type,
       ad_group_criterion.quality_info.quality_score,
       metrics.impressions, metrics.clicks, metrics.average_cpc
FROM keyword_view
WHERE ad_group_criterion.quality_info.quality_score < 5
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.impressions DESC
\`\`\`

### Daily Campaign Spend
\`\`\`
SELECT campaign.name, segments.date,
       metrics.cost_micros, metrics.impressions, metrics.clicks
FROM campaign
WHERE segments.date DURING LAST_14_DAYS
  AND campaign.status = 'ENABLED'
ORDER BY segments.date DESC
\`\`\`

### Device Breakdown
\`\`\`
SELECT campaign.name, segments.device,
       metrics.impressions, metrics.clicks, metrics.ctr
FROM campaign
WHERE segments.date DURING LAST_7_DAYS
  AND campaign.status = 'ENABLED'
\`\`\`

## Important Notes

- **Micros**: All monetary values are in micros. Divide by 1,000,000 for display currency.
- **Segment compatibility**: Not all segments can be combined. Use Google Ads FieldService for validation.
- **Date segments**: Adding \`segments.date\` returns one row per entity per day.
- **Resource limits**: Queries return max 10,000 rows by default; use \`LIMIT\` to control.
- **Removed entities**: By default, REMOVED entities are excluded. Add \`PARAMETERS include_drafts=true\` to include them.
`;
}

export const gaqlReferenceResource: Resource = {
  uri: "gaql-reference://syntax",
  name: "GAQL Syntax Reference",
  description: "Google Ads Query Language syntax guide with common query patterns, operators, metrics, and segments",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= buildGaqlReferenceMarkdown();
    return cachedContent;
  },
};