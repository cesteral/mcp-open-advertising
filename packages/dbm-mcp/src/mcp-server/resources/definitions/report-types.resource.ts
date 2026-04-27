// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Report Types MCP Resource
 *
 * Provides a reference of all available Bid Manager API report types
 * and date range presets.
 *
 * Dynamically generated from the reference data file.
 */

import type { Resource } from "../types.js";
import {
  REPORT_TYPE_METADATA,
  DATA_RANGE_DESCRIPTIONS,
  METRIC_METADATA,
  FILTER_METADATA,
  type ReportType,
  type DataRange,
  type MetricType,
  type MetricMetadata,
  type FilterType,
  type FilterMetadata,
} from "../../../generated/index.js";

/**
 * Get metrics available for a specific report type
 */
function getMetricsForReportType(reportType: ReportType): string[] {
  const metrics: string[] = [];
  for (const [metric, meta] of Object.entries(METRIC_METADATA) as [MetricType, MetricMetadata][]) {
    if (meta.reportTypes?.includes(reportType)) {
      metrics.push(metric);
    }
  }
  return metrics.sort();
}

/**
 * Get filters available for a specific report type
 */
function getFiltersForReportType(reportType: ReportType): string[] {
  const filters: string[] = [];
  for (const [filter, meta] of Object.entries(FILTER_METADATA) as [FilterType, FilterMetadata][]) {
    if (meta.reportTypes?.includes(reportType)) {
      filters.push(filter);
    }
  }
  return filters.sort();
}

/**
 * Format report types documentation as markdown
 */
function formatReportTypesMarkdown(): string {
  let markdown = `# Bid Manager API Report Types Reference

This resource provides a complete reference of all available report types and date range presets for Bid Manager API queries.

---

## Report Types

| Report Type | Display Name | Description |
|-------------|--------------|-------------|
`;

  for (const [type, meta] of Object.entries(REPORT_TYPE_METADATA) as [
    ReportType,
    (typeof REPORT_TYPE_METADATA)[ReportType],
  ][]) {
    markdown += `| \`${type}\` | ${meta.displayName} | ${meta.description} |\n`;
  }

  markdown += `

### When to Use Each Report Type

#### STANDARD (Most Common)
Use for general delivery metrics, campaign performance, and cost analysis.
\`\`\`json
{
  "reportType": "STANDARD",
  "groupBys": ["FILTER_DATE", "FILTER_MEDIA_PLAN"],
  "metrics": ["METRIC_IMPRESSIONS", "METRIC_CLICKS", "METRIC_TOTAL_MEDIA_COST_ADVERTISER"]
}
\`\`\`

#### FLOODLIGHT
Use when analyzing conversion data from Floodlight tags.
\`\`\`json
{
  "reportType": "FLOODLIGHT",
  "groupBys": ["FILTER_DATE", "FILTER_FLOODLIGHT_ACTIVITY"],
  "metrics": ["METRIC_TOTAL_CONVERSIONS", "METRIC_POST_CLICK_CONVERSIONS", "METRIC_POST_VIEW_CONVERSIONS"]
}
\`\`\`

#### YOUTUBE
Use for YouTube-specific campaign analysis.
\`\`\`json
{
  "reportType": "YOUTUBE",
  "groupBys": ["FILTER_DATE", "FILTER_LINE_ITEM"],
  "metrics": ["METRIC_TRUEVIEW_VIEWS", "METRIC_TRUEVIEW_VIEW_RATE", "METRIC_TRUEVIEW_CPV_ADVERTISER"]
}
\`\`\`

#### REACH / UNIQUE_REACH_AUDIENCE
Use for reach and frequency analysis.
\`\`\`json
{
  "reportType": "REACH",
  "groupBys": ["FILTER_DATE"],
  "metrics": ["METRIC_UNIQUE_REACH_IMPRESSION_REACH", "METRIC_UNIQUE_REACH_AVERAGE_IMPRESSION_FREQUENCY"]
}
\`\`\`

---

## Date Range Presets

Date ranges can be specified either as a preset or with custom dates.

### Available Presets

| Preset | Description |
|--------|-------------|
`;

  for (const [preset, description] of Object.entries(DATA_RANGE_DESCRIPTIONS) as [
    DataRange,
    string,
  ][]) {
    markdown += `| \`${preset}\` | ${description} |\n`;
  }

  markdown += `

### Using Presets

\`\`\`json
{
  "dateRange": {
    "preset": "LAST_7_DAYS"
  }
}
\`\`\`

### Using Custom Dates

\`\`\`json
{
  "dateRange": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
\`\`\`

---

## Best Practices

1. **Use STANDARD for most queries** - It supports the widest range of filters and metrics
2. **Match metrics to report type** - Some metrics are only available in specific report types
3. **Use preset date ranges when possible** - Faster processing than custom dates
4. **Consider data freshness** - CURRENT_DAY data may be incomplete; PREVIOUS_DAY is safer for accurate reporting

---

## Compatible Metrics by Report Type

Each report type supports a specific set of metrics. Using incompatible metrics will result in an API error.

### STANDARD Report Metrics (${getMetricsForReportType("STANDARD").length} metrics)
Most general metrics are available. See \`metric-types://all\` for the full list.

### YOUTUBE Report Metrics (${getMetricsForReportType("YOUTUBE").length} metrics)
Includes TrueView-specific metrics:
\`\`\`
${getMetricsForReportType("YOUTUBE")
  .filter((m) => m.includes("TRUEVIEW"))
  .slice(0, 10)
  .join("\n")}
${getMetricsForReportType("YOUTUBE").filter((m) => m.includes("TRUEVIEW")).length > 10 ? "... and more" : ""}
\`\`\`

### REACH/UNIQUE_REACH_AUDIENCE Report Metrics (${getMetricsForReportType("REACH").length} metrics)
\`\`\`
${getMetricsForReportType("REACH").join("\n")}
\`\`\`

### GRP Report Metrics (${getMetricsForReportType("GRP").length} metrics)
Includes GRP-specific metrics. See \`metric-types://all\` for details.

### FLOODLIGHT Report Metrics (${getMetricsForReportType("FLOODLIGHT").length} metrics)
Includes Floodlight conversion metrics. See \`metric-types://all\` for details.

---

## Compatible Filters by Report Type

### STANDARD Report Filters (${getFiltersForReportType("STANDARD").length} filters)
Most general filters are available. See \`filter-types://all\` for the full list.

### YOUTUBE Report Filters (${getFiltersForReportType("YOUTUBE").length} filters)
Includes TrueView-specific filters:
\`\`\`
${getFiltersForReportType("YOUTUBE")
  .filter((f) => f.includes("TRUEVIEW"))
  .slice(0, 10)
  .join("\n")}
${getFiltersForReportType("YOUTUBE").filter((f) => f.includes("TRUEVIEW")).length > 10 ? "... and more" : ""}
\`\`\`

### GRP Report Filters (${getFiltersForReportType("GRP").length} filters)
Includes Nielsen-specific filters:
\`\`\`
${
  getFiltersForReportType("GRP")
    .filter((f) => f.includes("NIELSEN"))
    .join("\n") || "See filter-types://all for details"
}
\`\`\`

---

## Additional Resources

For complete lists, fetch these MCP Resources:
- \`metric-types://all\` - All metrics with report type compatibility
- \`filter-types://all\` - All filters with report type compatibility
- \`compatibility-rules://all\` - Detailed compatibility rules and warnings
`;

  return markdown;
}

/**
 * Report types resource definition
 */
export const reportTypesResource: Resource = {
  uri: "report-types://all",
  name: "Bid Manager Report Types",
  description:
    "Complete reference of all available Bid Manager API report types and date range presets",
  mimeType: "text/markdown",
  getContent: () => formatReportTypesMarkdown(),
};
