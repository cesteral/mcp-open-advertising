// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const reportingReferenceResource: Resource = {
  uri: "reporting-reference://all",
  name: "CM360 Reporting Reference",
  description: "Report types, dimensions, metrics, and filters for CM360 async reporting",
  mimeType: "text/markdown",
  getContent: () => `# CM360 Reporting Reference

## Report Types

| Type | Description |
|------|-------------|
| STANDARD | Standard delivery metrics |
| REACH | Reach and frequency reporting |
| FLOODLIGHT | Conversion (Floodlight) reporting |
| PATH_TO_CONVERSION | Multi-touch attribution paths |
| CROSS_DIMENSION_REACH | Cross-dimension reach analysis |

## Common Dimensions

| Dimension | Description |
|-----------|-------------|
| campaign | Campaign name/ID |
| placement | Placement name/ID |
| ad | Ad name/ID |
| creative | Creative name/ID |
| site | Site name/ID |
| advertiser | Advertiser name/ID |
| date | Date (daily granularity) |
| week | Week |
| month | Month |

## Common Metrics

| Metric | Description |
|--------|-------------|
| impressions | Total ad impressions served |
| clicks | Total clicks |
| totalConversions | All Floodlight conversions |
| totalConversionsRevenue | Conversion revenue |
| richMediaVideoViews | Video view count |
| richMediaVideoCompletions | Video completions |
| activeViewViewableImpressions | Viewable impressions (Active View) |
| activeViewMeasurableImpressions | Measurable impressions |

## Async Report Flow

1. **Submit**: \`cm360_submit_report\` or \`cm360_get_report\` (blocking)
2. **Poll**: \`cm360_check_report_status\` (for non-blocking flow)
3. **Download**: \`cm360_download_report\` (parse CSV results)

## Date Format

Use \`YYYY-MM-DD\` format for startDate and endDate.

## Gotchas

- Reports are async — processing can take minutes for large date ranges
- Use \`cm360_get_report\` for simplicity (handles poll + download)
- Large reports may need non-blocking flow to avoid timeouts
`,
};
