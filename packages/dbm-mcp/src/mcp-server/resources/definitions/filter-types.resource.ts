/**
 * Filter Types MCP Resource
 *
 * Provides a reference of all available Bid Manager API filter/dimension types
 * with descriptions and usage guidance.
 *
 * Now dynamically generated from the reference data file.
 */

import type { Resource } from "../types.js";
import {
  FILTER_METADATA,
  FILTER_CATEGORIES,
  type FilterType,
  type FilterMetadata,
} from "../../../generated/index.js";

let cachedFiltersMarkdown: string | undefined;
const cachedCategoryMarkdown = new Map<string, string>();

function toCategorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Format filters documentation as markdown
 */
function formatFiltersMarkdown(): string {
  const byCategory = new Map<string, Array<[FilterType, FilterMetadata]>>();
  const byReportType = new Map<string, Array<[FilterType, FilterMetadata]>>();

  // Group filters by category and by report type
  for (const [filter, meta] of Object.entries(FILTER_METADATA) as [FilterType, FilterMetadata][]) {
    // By category
    const existing = byCategory.get(meta.category) || [];
    existing.push([filter, meta]);
    byCategory.set(meta.category, existing);

    // By report type (for exclusive filters)
    if (meta.reportTypes && meta.reportTypes.length < 3) {
      // Only show filters that are NOT available in all report types
      for (const rt of meta.reportTypes) {
        const rtExisting = byReportType.get(rt) || [];
        rtExisting.push([filter, meta]);
        byReportType.set(rt, rtExisting);
      }
    }
  }

  const totalFilters = Object.keys(FILTER_METADATA).length;

  let markdown = `# Bid Manager API Filter/Dimension Types Reference

This resource provides a complete reference of all ${totalFilters} available filter and dimension types for Bid Manager API queries.

## Usage

Filters are used in two ways:
1. **In \`filters\` array**: To restrict data to specific values (e.g., filter by advertiser ID)
2. **In \`groupBys\` array**: To break down data by dimension (e.g., daily breakdown)

**Important:** Not all filters are available in all report types. Check the "Report Types" column to ensure compatibility.

## Categories

${FILTER_CATEGORIES.map((cat) => `- ${cat}`).join("\n")}

---

## Report Type-Specific Filters

Some filters are ONLY available in specific report types:

### YOUTUBE-Only Filters
These TrueView filters require \`reportType: "YOUTUBE"\`:
${Array.from(byReportType.get("YOUTUBE") || [])
  .map(([f]) => `- \`${f}\``)
  .join("\n") || "- None currently defined"}

### GRP-Only Filters
These Nielsen filters require \`reportType: "GRP"\`:
${Array.from(byReportType.get("GRP") || [])
  .map(([f]) => `- \`${f}\``)
  .join("\n") || "- None currently defined"}

### YOUTUBE_PROGRAMMATIC_GUARANTEED-Only Filters
These filters require \`reportType: "YOUTUBE_PROGRAMMATIC_GUARANTEED"\`:
${Array.from(byReportType.get("YOUTUBE_PROGRAMMATIC_GUARANTEED") || [])
  .map(([f]) => `- \`${f}\``)
  .join("\n") || "- None currently defined"}

---

`;

  // Sort categories for consistent output
  const sortedCategories = Array.from(byCategory.keys()).sort();

  for (const category of sortedCategories) {
    const filters = byCategory.get(category)!;
    markdown += `## ${category} Filters (${filters.length})\n\n`;
    markdown += "| Filter | Display Name | Report Types | Usage |\n";
    markdown += "|--------|--------------|--------------|-------|\n";

    // Sort filters within category
    filters.sort((a, b) => a[0].localeCompare(b[0]));

    for (const [filter, meta] of filters) {
      const usageStr = meta.usage.join(", ");
      const reportTypes = meta.reportTypes?.join(", ") || "All";
      markdown += `| \`${filter}\` | ${meta.displayName} | ${reportTypes} | ${usageStr} |\n`;
    }

    markdown += "\n";
  }

  markdown += `---

## Common Filter Combinations

### Daily Delivery by Campaign
\`\`\`json
{
  "groupBys": ["FILTER_DATE", "FILTER_CAMPAIGN"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" }
  ]
}
\`\`\`

### Device Type Breakdown
\`\`\`json
{
  "groupBys": ["FILTER_DEVICE_TYPE"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" },
    { "type": "FILTER_CAMPAIGN", "value": "789012" }
  ]
}
\`\`\`

### Geographic Performance
\`\`\`json
{
  "groupBys": ["FILTER_COUNTRY", "FILTER_REGION"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" }
  ]
}
\`\`\`

### Line Item Performance
\`\`\`json
{
  "groupBys": ["FILTER_LINE_ITEM"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" },
    { "type": "FILTER_CAMPAIGN", "value": "789012" }
  ]
}
\`\`\`

### Time of Day Analysis
\`\`\`json
{
  "groupBys": ["FILTER_TIME_OF_DAY", "FILTER_DAY_OF_WEEK"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" }
  ]
}
\`\`\`

### Creative Performance
\`\`\`json
{
  "groupBys": ["FILTER_CREATIVE", "FILTER_CREATIVE_SIZE"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" },
    { "type": "FILTER_LINE_ITEM", "value": "345678" }
  ]
}
\`\`\`
`;

  return markdown;
}

function formatFiltersCategoryMarkdown(category: string): string {
  const cacheKey = toCategorySlug(category);
  const cached = cachedCategoryMarkdown.get(cacheKey);
  if (cached) {
    return cached;
  }

  const filters = (Object.entries(FILTER_METADATA) as [FilterType, FilterMetadata][])
    .filter(([, meta]) => meta.category === category)
    .sort((a, b) => a[0].localeCompare(b[0]));

  let markdown = `# ${category} Filter Types

This resource contains only \`${category}\` filters from the full \`filter-types://all\` reference.

| Filter | Display Name | Report Types | Usage |
|--------|--------------|--------------|-------|
`;

  for (const [filter, meta] of filters) {
    const usageStr = meta.usage.join(", ");
    const reportTypes = meta.reportTypes?.join(", ") || "All";
    markdown += `| \`${filter}\` | ${meta.displayName} | ${reportTypes} | ${usageStr} |\n`;
  }

  markdown += `
---

Need the full catalog? Use \`filter-types://all\`.
`;

  cachedCategoryMarkdown.set(cacheKey, markdown);
  return markdown;
}

/**
 * Filter types resource definition
 */
export const filterTypesResource: Resource = {
  uri: "filter-types://all",
  name: "Bid Manager Filter/Dimension Types",
  description: `Complete reference of all ${Object.keys(FILTER_METADATA).length} available Bid Manager API filters and dimensions`,
  mimeType: "text/markdown",
  getContent: () => {
    cachedFiltersMarkdown ??= formatFiltersMarkdown();
    return cachedFiltersMarkdown;
  },
};

export const filterTypeCategoryResources: Resource[] = FILTER_CATEGORIES.map((category) => ({
  uri: `filter-types://category/${toCategorySlug(category)}`,
  name: `Bid Manager Filter Types (${category})`,
  description: `Filter/dimension reference for ${category} category`,
  mimeType: "text/markdown",
  getContent: () => formatFiltersCategoryMarkdown(category),
}));
