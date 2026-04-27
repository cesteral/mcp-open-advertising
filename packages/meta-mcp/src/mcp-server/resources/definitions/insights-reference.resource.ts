// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Insights Reference Resource
 */
import type { Resource } from "../types.js";

export const insightsReferenceResource: Resource = {
  uri: "insights-reference://all",
  name: "Meta Insights Reference",
  description:
    "Metrics, breakdowns, date presets, and attribution windows for Meta Ads Insights API",
  mimeType: "text/markdown",
  getContent: () => `# Meta Insights API Reference

## Common Metrics (fields)

| Metric | Description |
|--------|-------------|
| impressions | Total impressions |
| clicks | Total clicks |
| spend | Total spend (in account currency) |
| cpc | Cost per click |
| cpm | Cost per 1000 impressions |
| ctr | Click-through rate |
| reach | Unique people reached |
| frequency | Average frequency |
| actions | Action totals (purchases, leads, etc.) |
| action_values | Monetary values of actions |
| conversions | Total conversions |
| cost_per_action_type | Cost per action by type |
| unique_clicks | Unique clicks |
| unique_ctr | Unique click-through rate |
| video_avg_time_watched_actions | Avg video watch time |
| video_p25_watched_actions | 25% video completions |
| video_p50_watched_actions | 50% video completions |
| video_p75_watched_actions | 75% video completions |
| video_p100_watched_actions | 100% video completions |

## Date Presets

| Preset | Description |
|--------|-------------|
| today | Today |
| yesterday | Yesterday |
| this_month | Current month |
| last_month | Previous month |
| this_quarter | Current quarter |
| last_quarter | Previous quarter |
| this_year | Current year |
| last_year | Previous year |
| last_3d | Last 3 days |
| last_7d | Last 7 days |
| last_14d | Last 14 days |
| last_28d | Last 28 days |
| last_30d | Last 30 days |
| last_90d | Last 90 days |
| this_week_mon_today | This week (Monday to today) |
| this_week_sun_today | This week (Sunday to today) |
| last_week_mon_sun | Last week (Monday to Sunday) |
| last_week_sun_sat | Last week (Sunday to Saturday) |
| maximum | Maximum available range (up to 37 months) |
| data_maximum | Maximum range with available data |

## Custom Date Range

Use \`time_range\` parameter:
\`\`\`json
{ "since": "2026-01-01", "until": "2026-01-31" }
\`\`\`

## Time Increments

| Value | Description |
|-------|-------------|
| 1 | Daily |
| 7 | Weekly |
| monthly | Monthly |
| all_days | All days aggregated |

## Breakdowns

### Demographic
- \`age\` — Age ranges (18-24, 25-34, etc.)
- \`gender\` — Male, Female, Unknown

### Geographic
- \`country\` — Country
- \`region\` — State/Region
- \`dma\` — Designated Market Area

### Platform/Device
- \`device_platform\` — Mobile, Desktop
- \`platform_position\` — Feed, Stories, etc.
- \`publisher_platform\` — Facebook, Instagram, Audience Network

### Valid Combinations
- age + gender ✓
- country alone ✓
- country + region ✗ (same dimension)
- device_platform + publisher_platform ✓

## Attribution Windows

| Window | Description |
|--------|-------------|
| 1d_click | 1-day click attribution |
| 7d_click | 7-day click attribution (default) |
| 1d_view | 1-day view attribution |
| 7d_view | 7-day view attribution |

## Gotchas

- Data may lag up to **48 hours**
- Max date range: **37 months**
- Limit ~**20 metrics** per call for performance
- Results are **cursor-paginated** (use \`after\` param)
- \`level\` parameter aggregates across hierarchy (campaign, adset, ad)
`,
};
