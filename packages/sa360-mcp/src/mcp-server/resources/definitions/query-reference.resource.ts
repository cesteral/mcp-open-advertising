// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const queryReferenceResource: Resource = {
  uri: "query-reference://all",
  name: "SA360 Query Language Reference",
  description: "SA360 query language syntax, operators, segments, and best practices",
  mimeType: "text/markdown",
  getContent: () => `# SA360 Query Language Reference

## Syntax

\`\`\`sql
SELECT resource.field, metrics.field, segments.field
FROM resource_type
WHERE conditions
ORDER BY field [ASC|DESC]
LIMIT n
\`\`\`

## Resource Types

| Resource | Description |
|----------|-------------|
| customer | Account-level data |
| campaign | Campaign entities and metrics |
| ad_group | Ad group entities and metrics |
| ad_group_ad | Ad entities and metrics |
| ad_group_criterion | Keywords, audiences, and other criteria |
| campaign_criterion | Campaign-level targeting criteria |
| bidding_strategy | Portfolio bidding strategies |
| conversion_action | Conversion action definitions |

## Date Filtering

| Clause | Example |
|--------|---------|
| DURING preset | \`segments.date DURING LAST_7_DAYS\` |
| BETWEEN dates | \`segments.date BETWEEN '2026-01-01' AND '2026-01-31'\` |

### Date Presets
LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, THIS_QUARTER, LAST_QUARTER, THIS_YEAR, LAST_YEAR, TODAY, YESTERDAY

## Operators

| Operator | Example |
|----------|---------|
| = | \`campaign.status = 'ENABLED'\` |
| != | \`campaign.status != 'REMOVED'\` |
| IN | \`campaign.status IN ('ENABLED', 'PAUSED')\` |
| NOT IN | \`campaign.status NOT IN ('REMOVED')\` |
| LIKE | \`campaign.name LIKE '%brand%'\` |
| CONTAINS ANY | \`ad_group_ad.ad.final_urls CONTAINS ANY ('example.com')\` |
| IS NULL / IS NOT NULL | \`campaign.end_date IS NOT NULL\` |
| > < >= <= | \`metrics.impressions > 100\` |

## Common Metrics

| Metric | Type | Description |
|--------|------|-------------|
| metrics.impressions | int64 | Impressions |
| metrics.clicks | int64 | Clicks |
| metrics.cost_micros | int64 | Spend in micros (÷1,000,000) |
| metrics.conversions | double | Conversions |
| metrics.conversions_value | double | Conversion value |
| metrics.ctr | double | Click-through rate |
| metrics.average_cpc | int64 | Average CPC in micros |
| metrics.average_cpm | double | Average CPM |

## Segments

| Segment | Description |
|---------|-------------|
| segments.date | Daily date |
| segments.day_of_week | MONDAY through SUNDAY |
| segments.month | Monthly aggregation |
| segments.quarter | Quarterly aggregation |
| segments.device | MOBILE, DESKTOP, TABLET, OTHER |
| segments.conversion_action | Break down by conversion type |

## Gotchas

- \`cost_micros\` is in micros — divide by 1,000,000 for dollars
- Some field combinations are not allowed (check with \`sa360_search_fields\`)
- Pagination uses \`pageToken\` for large result sets
- Cross-resource joins happen implicitly via resource hierarchy
- \`segments.date\` must appear in WHERE when using date metrics
`,
};