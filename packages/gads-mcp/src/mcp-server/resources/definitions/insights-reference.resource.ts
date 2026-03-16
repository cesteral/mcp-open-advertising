// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const insightsReferenceResource: Resource = {
  uri: "insights-reference://gads",
  name: "Google Ads Insights Reference",
  description: "Available metrics, entity types, computed metrics, and date range options for gads_get_insights",
  mimeType: "text/markdown",
  getContent: () => `# Google Ads Insights Reference

## Available Metrics

Standard metrics that can be used with \`gads_get_insights\`:

| Metric | Description |
|--------|-------------|
| metrics.impressions | Number of ad impressions |
| metrics.clicks | Number of clicks |
| metrics.cost_micros | Cost in micros (divide by 1,000,000 for currency units) |
| metrics.conversions | Number of conversions |
| metrics.conversions_value | Total conversion value |
| metrics.ctr | Click-through rate (clicks / impressions) |
| metrics.average_cpc | Average cost per click |
| metrics.average_cpm | Average cost per thousand impressions |
| metrics.interactions | Number of interactions |
| metrics.interaction_rate | Interaction rate |
| metrics.all_conversions | All conversions (including cross-device) |
| metrics.all_conversions_value | All conversions value |
| metrics.search_impression_share | Search impression share |
| metrics.search_rank_lost_impression_share | Impression share lost to ad rank |
| metrics.quality_score | Keyword quality score (keywords only) |

## Supported Entity Types

| Entity Type | GAQL Resource | ID Field | Name Field |
|-------------|--------------|----------|------------|
| campaign | campaign | campaign.id | campaign.name |
| adGroup | ad_group | ad_group.id | ad_group.name |
| ad | ad_group_ad | ad_group_ad.ad.id | ad_group_ad.ad.name |
| keyword | keyword_view | ad_group_criterion.criterion_id | ad_group_criterion.keyword.text |

## Computed Metrics

When \`includeComputedMetrics: true\`, these derived metrics are added to each result row:

| Metric | Formula | Null When |
|--------|---------|-----------|
| cpa | cost / conversions | conversions = 0 |
| roas | conversions_value / cost | cost = 0 |
| cpm | (cost / impressions) × 1000 | impressions = 0 |

Where \`cost = cost_micros / 1,000,000\`.

## Date Range Options

### Preset Ranges
- \`TODAY\` — Current day
- \`YESTERDAY\` — Previous day
- \`LAST_7_DAYS\` — Past 7 days
- \`LAST_30_DAYS\` — Past 30 days
- \`THIS_MONTH\` — Current month to date
- \`LAST_MONTH\` — Previous calendar month
- \`LAST_90_DAYS\` — Past 90 days

### Custom Ranges
Provide \`startDate\` and \`endDate\` in YYYY-MM-DD format instead of \`dateRange\`.

Example: \`startDate: "2026-01-01", endDate: "2026-03-31"\`

## Default Metrics

impressions, clicks, cost_micros, conversions, ctr, average_cpc

## Notes

- For ad-hoc queries with custom field selection, use \`gads_gaql_search\` directly
- cost_micros is in micros — divide by 1,000,000 for the actual currency value
- keyword quality_score is only available for keyword entity type
`,
};
