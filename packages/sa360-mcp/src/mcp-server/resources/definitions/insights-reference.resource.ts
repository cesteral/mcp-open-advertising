// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const insightsReferenceResource: Resource = {
  uri: "insights-reference://all",
  name: "SA360 Insights Reference",
  description: "Available metrics, segments, entity types, computed metrics, and date range options for SA360 insights tools",
  mimeType: "text/markdown",
  getContent: () => `# SA360 Insights Reference

## Available Metrics

Standard metrics that can be used with \`sa360_get_insights\` and \`sa360_get_insights_breakdowns\`:

| Metric | Description |
|--------|-------------|
| metrics.impressions | Number of ad impressions |
| metrics.clicks | Number of clicks |
| metrics.cost_micros | Cost in micros (divide by 1,000,000 for currency units) |
| metrics.conversions | Number of conversions |
| metrics.conversions_value | Total value of conversions |
| metrics.ctr | Click-through rate (clicks / impressions) |
| metrics.average_cpc | Average cost per click |
| metrics.average_cpm | Average cost per thousand impressions |
| metrics.interactions | Number of interactions |
| metrics.interaction_rate | Interaction rate |
| metrics.all_conversions | All conversions (including cross-device) |
| metrics.all_conversions_value | All conversions value |
| metrics.cross_device_conversions | Cross-device conversions |
| metrics.absolute_top_impression_percentage | Top-of-page impression share |
| metrics.top_impression_percentage | Top impression share |

## Segments / Breakdowns

Available breakdown dimensions for \`sa360_get_insights_breakdowns\`:

| Segment | Description |
|---------|-------------|
| segments.date | Daily breakdown (YYYY-MM-DD) |
| segments.device | Device type (DESKTOP, MOBILE, TABLET) |
| segments.ad_network_type | Network type (SEARCH, CONTENT, etc.) |
| segments.conversion_action | Conversion action name |
| segments.day_of_week | Day of week (MONDAY, TUESDAY, etc.) |
| segments.month | Monthly breakdown |
| segments.quarter | Quarterly breakdown |
| segments.week | Weekly breakdown |
| segments.year | Yearly breakdown |

## Supported Entity Types

| Entity Type | Query Resource | ID Field | Name Field |
|-------------|---------------|----------|------------|
| customer | customer | customer.id | customer.descriptive_name |
| campaign | campaign | campaign.id | campaign.name |
| adGroup | ad_group | ad_group.id | ad_group.name |
| adGroupAd | ad_group_ad | ad_group_ad.ad.id | ad_group_ad.ad.name |
| adGroupCriterion | ad_group_criterion | ad_group_criterion.criterion_id | ad_group_criterion.keyword.text |
| campaignCriterion | campaign_criterion | campaign_criterion.criterion_id | campaign_criterion.type |

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

### sa360_get_insights
impressions, clicks, cost_micros, conversions, ctr, average_cpc

### sa360_get_insights_breakdowns
impressions, clicks, cost_micros, conversions
`,
};
