/**
 * Metric Types MCP Resource
 *
 * Provides a reference of all available Bid Manager API metrics
 * with descriptions and usage guidance.
 *
 * Now dynamically generated from the reference data file.
 */

import type { Resource } from "../types.js";
import {
  METRIC_METADATA,
  METRIC_CATEGORIES,
  COMMON_METRIC_SETS,
  type MetricType,
  type MetricMetadata,
} from "../../../generated/index.js";

let cachedMetricsMarkdown: string | undefined;
const cachedCategoryMarkdown = new Map<string, string>();

function toCategorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Format metrics documentation as markdown
 */
function formatMetricsMarkdown(): string {
  const byCategory = new Map<string, Array<[MetricType, MetricMetadata]>>();
  const byReportType = new Map<string, Array<[MetricType, MetricMetadata]>>();

  // Group metrics by category and by report type
  for (const [metric, meta] of Object.entries(METRIC_METADATA) as [MetricType, MetricMetadata][]) {
    // By category
    const existing = byCategory.get(meta.category) || [];
    existing.push([metric, meta]);
    byCategory.set(meta.category, existing);

    // By report type (for exclusive metrics)
    if (meta.reportTypes && meta.reportTypes.length < 3) {
      // Only show metrics that are NOT available in all report types
      for (const rt of meta.reportTypes) {
        const rtExisting = byReportType.get(rt) || [];
        rtExisting.push([metric, meta]);
        byReportType.set(rt, rtExisting);
      }
    }
  }

  const totalMetrics = Object.keys(METRIC_METADATA).length;

  let markdown = `# Bid Manager API Metrics Reference

This resource provides a complete reference of all ${totalMetrics} available metrics for Bid Manager API queries.

## Usage

When calling tools like \`run_custom_query\`, \`get_campaign_delivery\`, or \`get_historical_metrics\`, the following metrics are available.

**Important:** Not all metrics are available in all report types. Check the "Report Types" column to ensure compatibility.

## Categories

${METRIC_CATEGORIES.map((cat) => `- ${cat}`).join("\n")}

---

## Report Type-Specific Metrics

Some metrics are ONLY available in specific report types:

### YOUTUBE-Only Metrics
These TrueView metrics require \`reportType: "YOUTUBE"\`:
${Array.from(byReportType.get("YOUTUBE") || [])
  .map(([m]) => `- \`${m}\``)
  .join("\n")}

### REACH/UNIQUE_REACH_AUDIENCE-Only Metrics
These Unique Reach metrics require \`reportType: "REACH"\` or \`"UNIQUE_REACH_AUDIENCE"\`:
${Array.from(byReportType.get("REACH") || [])
  .map(([m]) => `- \`${m}\``)
  .join("\n")}

### GRP-Only Metrics
These GRP metrics require \`reportType: "GRP"\`:
${Array.from(byReportType.get("GRP") || [])
  .map(([m]) => `- \`${m}\``)
  .join("\n") || "- None currently defined"}

---

`;

  // Sort categories for consistent output
  const sortedCategories = Array.from(byCategory.keys()).sort();

  for (const category of sortedCategories) {
    const metrics = byCategory.get(category)!;
    markdown += `## ${category} Metrics (${metrics.length})\n\n`;
    markdown += "| Metric | Display Name | Report Types | Data Type |\n";
    markdown += "|--------|--------------|--------------|----------|\n";

    // Sort metrics within category
    metrics.sort((a, b) => a[0].localeCompare(b[0]));

    for (const [metric, meta] of metrics) {
      const reportTypes = meta.reportTypes?.join(", ") || "All";
      markdown += `| \`${metric}\` | ${meta.displayName} | ${reportTypes} | ${meta.dataType || "—"} |\n`;
    }

    markdown += "\n";
  }

  markdown += `---

## Common Metric Sets

These are pre-defined metric combinations for common use cases:

`;

  for (const [setName, metrics] of Object.entries(COMMON_METRIC_SETS)) {
    markdown += `### ${setName.replace(/_/g, " ")}\n`;
    markdown += "```\n";
    markdown += metrics.join(",\n");
    markdown += "\n```\n\n";
  }

  markdown += `---

## Example Queries

### Delivery Overview
\`\`\`json
{
  "metrics": [
    "METRIC_IMPRESSIONS",
    "METRIC_CLICKS",
    "METRIC_CTR",
    "METRIC_TOTAL_MEDIA_COST_ADVERTISER"
  ]
}
\`\`\`

### Performance Metrics
\`\`\`json
{
  "metrics": [
    "METRIC_IMPRESSIONS",
    "METRIC_CLICKS",
    "METRIC_TOTAL_CONVERSIONS",
    "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
    "METRIC_REVENUE_ADVERTISER"
  ]
}
\`\`\`

### Video Performance
\`\`\`json
{
  "metrics": [
    "METRIC_RICH_MEDIA_VIDEO_PLAYS",
    "METRIC_RICH_MEDIA_VIDEO_COMPLETIONS",
    "METRIC_RICH_MEDIA_VIDEO_FIRST_QUARTILE_COMPLETES",
    "METRIC_RICH_MEDIA_VIDEO_MIDPOINTS",
    "METRIC_RICH_MEDIA_VIDEO_THIRD_QUARTILE_COMPLETES",
    "METRIC_RICH_MEDIA_VIDEO_SKIPS"
  ]
}
\`\`\`

### Viewability Analysis
\`\`\`json
{
  "metrics": [
    "METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS",
    "METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
    "METRIC_ACTIVE_VIEW_PCT_VIEWABLE_IMPRESSIONS",
    "METRIC_ACTIVE_VIEW_PCT_MEASURABLE_IMPRESSIONS"
  ]
}
\`\`\`

### Cost Efficiency
\`\`\`json
{
  "metrics": [
    "METRIC_IMPRESSIONS",
    "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
    "METRIC_TOTAL_MEDIA_COST_ECPM_ADVERTISER",
    "METRIC_MEDIA_COST_ECPC_ADVERTISER",
    "METRIC_MEDIA_COST_ECPA_ADVERTISER"
  ]
}
\`\`\`

### TrueView Campaigns
\`\`\`json
{
  "metrics": [
    "METRIC_TRUEVIEW_VIEWS",
    "METRIC_TRUEVIEW_VIEW_RATE",
    "METRIC_TRUEVIEW_CPV_ADVERTISER",
    "METRIC_TRUEVIEW_EARNED_VIEWS",
    "METRIC_TRUEVIEW_EARNED_SUBSCRIBERS"
  ]
}
\`\`\`
`;

  return markdown;
}

function formatMetricsCategoryMarkdown(category: string): string {
  const cacheKey = toCategorySlug(category);
  const cached = cachedCategoryMarkdown.get(cacheKey);
  if (cached) {
    return cached;
  }

  const metrics = (Object.entries(METRIC_METADATA) as [MetricType, MetricMetadata][])
    .filter(([, meta]) => meta.category === category)
    .sort((a, b) => a[0].localeCompare(b[0]));

  let markdown = `# ${category} Metric Types

This resource contains only \`${category}\` metrics from the full \`metric-types://all\` reference.

| Metric | Display Name | Report Types | Data Type |
|--------|--------------|--------------|----------|
`;

  for (const [metric, meta] of metrics) {
    const reportTypes = meta.reportTypes?.join(", ") || "All";
    markdown += `| \`${metric}\` | ${meta.displayName} | ${reportTypes} | ${meta.dataType || "—"} |\n`;
  }

  markdown += `
---

Need the full catalog? Use \`metric-types://all\`.
`;

  cachedCategoryMarkdown.set(cacheKey, markdown);
  return markdown;
}

/**
 * Metric types resource definition
 */
export const metricTypesResource: Resource = {
  uri: "metric-types://all",
  name: "Bid Manager Metric Types",
  description: `Complete reference of all ${Object.keys(METRIC_METADATA).length} available Bid Manager API metrics with descriptions`,
  mimeType: "text/markdown",
  getContent: () => {
    cachedMetricsMarkdown ??= formatMetricsMarkdown();
    return cachedMetricsMarkdown;
  },
};

export const metricTypeCategoryResources: Resource[] = METRIC_CATEGORIES.map((category) => ({
  uri: `metric-types://category/${toCategorySlug(category)}`,
  name: `Bid Manager Metric Types (${category})`,
  description: `Metric reference for ${category} category`,
  mimeType: "text/markdown",
  getContent: () => formatMetricsCategoryMarkdown(category),
}));
