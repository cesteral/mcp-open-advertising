#!/usr/bin/env node
/**
 * Type Generation Script for Bid Manager API Reference
 *
 * Reads bid-manager-reference.json and generates:
 * 1. Zod schemas for filters and metrics
 * 2. TypeScript types derived from Zod
 * 3. Metadata exports for MCP Resources to consume
 *
 * Usage: pnpm run generate
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface FilterDefinition {
  displayName: string;
  reportBuilderName: string;
  category: string;
  description: string;
  usage: string[];
  reportTypes?: string[];
  notes?: string;
}

interface MetricDefinition {
  displayName: string;
  reportBuilderName: string;
  category: string;
  description: string;
  dataType?: string;
  reportTypes?: string[];
  aggregation?: string;
  formula?: string;
  notes?: string;
}

interface ReportTypeDefinition {
  displayName: string;
  description: string;
}

interface ReferenceData {
  version: string;
  lastUpdated?: string;
  source?: string;
  filters: Record<string, FilterDefinition>;
  metrics: Record<string, MetricDefinition>;
  reportTypes: Record<string, ReportTypeDefinition>;
  dataRanges: string[];
  categories: {
    filters: string[];
    metrics: string[];
  };
}

async function main() {
  console.log("🔄 Generating types from bid-manager-reference.json...\n");

  // Read reference JSON
  const refPath = path.resolve(__dirname, "../data/bid-manager-reference.json");
  const refContent = await fs.readFile(refPath, "utf-8");
  const reference: ReferenceData = JSON.parse(refContent);

  const filterCount = Object.keys(reference.filters).length;
  const metricCount = Object.keys(reference.metrics).length;
  const reportTypeCount = Object.keys(reference.reportTypes).length;

  console.log(
    `📊 Found ${filterCount} filters, ${metricCount} metrics, ${reportTypeCount} report types\n`
  );

  // Generate modules
  const filtersCode = generateFiltersModule(reference);
  const metricsCode = generateMetricsModule(reference);
  const reportTypesCode = generateReportTypesModule(reference);
  const indexCode = generateIndexModule();

  // Write to src/generated/
  const outputDir = path.resolve(__dirname, "../src/generated");
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, "filters.ts"), filtersCode);
  console.log("✅ Generated src/generated/filters.ts");

  await fs.writeFile(path.join(outputDir, "metrics.ts"), metricsCode);
  console.log("✅ Generated src/generated/metrics.ts");

  await fs.writeFile(path.join(outputDir, "report-types.ts"), reportTypesCode);
  console.log("✅ Generated src/generated/report-types.ts");

  await fs.writeFile(path.join(outputDir, "index.ts"), indexCode);
  console.log("✅ Generated src/generated/index.ts");

  console.log("\n🎉 Type generation complete!");
}

function generateFiltersModule(reference: ReferenceData): string {
  const filterNames = Object.keys(reference.filters).sort();

  return `// AUTO-GENERATED - DO NOT EDIT
// Generated from data/bid-manager-reference.json
// Run 'pnpm run generate' to regenerate

import { z } from "zod";

/**
 * All available Bid Manager API filter types
 * Total: ${filterNames.length} filters
 */
export const FilterTypeSchema = z.enum([
${filterNames.map((f) => `  "${f}"`).join(",\n")}
]);

export type FilterType = z.infer<typeof FilterTypeSchema>;

/**
 * Filter metadata for documentation and validation
 */
export interface FilterMetadata {
  displayName: string;
  reportBuilderName: string;
  category: string;
  description: string;
  usage: ("filter" | "groupBy")[];
  reportTypes?: string[];
  notes?: string;
}

/**
 * Complete metadata for all filters
 */
export const FILTER_METADATA: Record<FilterType, FilterMetadata> = {
${Object.entries(reference.filters)
  .map(
    ([name, def]) => `  "${name}": {
    displayName: ${JSON.stringify(def.displayName)},
    reportBuilderName: ${JSON.stringify(def.reportBuilderName)},
    category: ${JSON.stringify(def.category)},
    description: ${JSON.stringify(def.description)},
    usage: ${JSON.stringify(def.usage)}${def.reportTypes ? `,\n    reportTypes: ${JSON.stringify(def.reportTypes)}` : ""}${def.notes ? `,\n    notes: ${JSON.stringify(def.notes)}` : ""}
  }`
  )
  .join(",\n")}
};

/**
 * Available filter categories
 */
export const FILTER_CATEGORIES = ${JSON.stringify(reference.categories.filters, null, 2)} as const;

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

/**
 * Get all filters in a specific category
 */
export function getFiltersByCategory(category: FilterCategory): FilterType[] {
  return (Object.entries(FILTER_METADATA) as [FilterType, FilterMetadata][])
    .filter(([_, meta]) => meta.category === category)
    .map(([name]) => name);
}

/**
 * Get filters that can be used as groupBys
 */
export function getGroupByFilters(): FilterType[] {
  return (Object.entries(FILTER_METADATA) as [FilterType, FilterMetadata][])
    .filter(([_, meta]) => meta.usage.includes("groupBy"))
    .map(([name]) => name);
}

/**
 * Check if a string is a valid filter type
 */
export function isValidFilterType(value: string): value is FilterType {
  return FilterTypeSchema.safeParse(value).success;
}
`;
}

function generateMetricsModule(reference: ReferenceData): string {
  const metricNames = Object.keys(reference.metrics).sort();

  return `// AUTO-GENERATED - DO NOT EDIT
// Generated from data/bid-manager-reference.json
// Run 'pnpm run generate' to regenerate

import { z } from "zod";

/**
 * All available Bid Manager API metric types
 * Total: ${metricNames.length} metrics
 */
export const MetricTypeSchema = z.enum([
${metricNames.map((m) => `  "${m}"`).join(",\n")}
]);

export type MetricType = z.infer<typeof MetricTypeSchema>;

/**
 * Metric metadata for documentation and validation
 */
export interface MetricMetadata {
  displayName: string;
  reportBuilderName: string;
  category: string;
  description: string;
  dataType?: "integer" | "decimal" | "percentage" | "currency" | "string";
  reportTypes?: string[];
  aggregation?: "sum" | "average" | "calculated" | "max" | "min";
  formula?: string;
  notes?: string;
}

/**
 * Complete metadata for all metrics
 */
export const METRIC_METADATA: Record<MetricType, MetricMetadata> = {
${Object.entries(reference.metrics)
  .map(
    ([name, def]) => `  "${name}": {
    displayName: ${JSON.stringify(def.displayName)},
    reportBuilderName: ${JSON.stringify(def.reportBuilderName)},
    category: ${JSON.stringify(def.category)},
    description: ${JSON.stringify(def.description)}${def.dataType ? `,\n    dataType: ${JSON.stringify(def.dataType)}` : ""}${def.reportTypes ? `,\n    reportTypes: ${JSON.stringify(def.reportTypes)}` : ""}${def.aggregation ? `,\n    aggregation: ${JSON.stringify(def.aggregation)}` : ""}${def.formula ? `,\n    formula: ${JSON.stringify(def.formula)}` : ""}${def.notes ? `,\n    notes: ${JSON.stringify(def.notes)}` : ""}
  }`
  )
  .join(",\n")}
};

/**
 * Available metric categories
 */
export const METRIC_CATEGORIES = ${JSON.stringify(reference.categories.metrics, null, 2)} as const;

export type MetricCategory = (typeof METRIC_CATEGORIES)[number];

/**
 * Get all metrics in a specific category
 */
export function getMetricsByCategory(category: MetricCategory): MetricType[] {
  return (Object.entries(METRIC_METADATA) as [MetricType, MetricMetadata][])
    .filter(([_, meta]) => meta.category === category)
    .map(([name]) => name);
}

/**
 * Check if a string is a valid metric type
 */
export function isValidMetricType(value: string): value is MetricType {
  return MetricTypeSchema.safeParse(value).success;
}

/**
 * Common metric combinations for typical use cases
 */
export const COMMON_METRIC_SETS = {
  delivery: [
    "METRIC_IMPRESSIONS",
    "METRIC_CLICKS",
    "METRIC_CTR"
  ] as MetricType[],

  performance: [
    "METRIC_IMPRESSIONS",
    "METRIC_CLICKS",
    "METRIC_CTR",
    "METRIC_TOTAL_CONVERSIONS",
    "METRIC_TOTAL_MEDIA_COST_ADVERTISER"
  ] as MetricType[],

  video: [
    "METRIC_RICH_MEDIA_VIDEO_PLAYS",
    "METRIC_RICH_MEDIA_VIDEO_COMPLETIONS",
    "METRIC_VIDEO_COMPLETION_RATE",
    "METRIC_RICH_MEDIA_VIDEO_FIRST_QUARTILE_COMPLETES",
    "METRIC_RICH_MEDIA_VIDEO_MIDPOINTS",
    "METRIC_RICH_MEDIA_VIDEO_THIRD_QUARTILE_COMPLETES"
  ] as MetricType[],

  viewability: [
    "METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS",
    "METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
    "METRIC_ACTIVE_VIEW_PCT_VIEWABLE_IMPRESSIONS",
    "METRIC_ACTIVE_VIEW_PCT_MEASURABLE_IMPRESSIONS"
  ] as MetricType[],

  reach: [
    "METRIC_UNIQUE_REACH_IMPRESSION_REACH",
    "METRIC_UNIQUE_REACH_CLICK_REACH",
    "METRIC_UNIQUE_REACH_TOTAL_REACH",
    "METRIC_UNIQUE_REACH_AVERAGE_IMPRESSION_FREQUENCY"
  ] as MetricType[],

  trueview: [
    "METRIC_TRUEVIEW_VIEWS",
    "METRIC_TRUEVIEW_VIEW_RATE",
    "METRIC_TRUEVIEW_EARNED_VIEWS",
    "METRIC_TRUEVIEW_EARNED_SUBSCRIBERS"
  ] as MetricType[]
} as const;
`;
}

function generateReportTypesModule(reference: ReferenceData): string {
  const reportTypeNames = Object.keys(reference.reportTypes).sort();

  return `// AUTO-GENERATED - DO NOT EDIT
// Generated from data/bid-manager-reference.json
// Run 'pnpm run generate' to regenerate

import { z } from "zod";

/**
 * Available Bid Manager report types
 */
export const ReportTypeSchema = z.enum([
${reportTypeNames.map((r) => `  "${r}"`).join(",\n")}
]);

export type ReportType = z.infer<typeof ReportTypeSchema>;

/**
 * Report type metadata
 */
export interface ReportTypeMetadata {
  displayName: string;
  description: string;
}

/**
 * Metadata for all report types
 */
export const REPORT_TYPE_METADATA: Record<ReportType, ReportTypeMetadata> = {
${Object.entries(reference.reportTypes)
  .map(
    ([name, def]) => `  "${name}": {
    displayName: ${JSON.stringify(def.displayName)},
    description: ${JSON.stringify(def.description)}
  }`
  )
  .join(",\n")}
};

/**
 * Available date range presets
 */
export const DataRangeSchema = z.enum([
${reference.dataRanges.map((r) => `  "${r}"`).join(",\n")}
]);

export type DataRange = z.infer<typeof DataRangeSchema>;

/**
 * Date range preset descriptions
 */
export const DATA_RANGE_DESCRIPTIONS: Record<DataRange, string> = {
  RANGE_UNSPECIFIED: "Default/unspecified range",
  CUSTOM_DATES: "Use custom start and end dates",
  CURRENT_DAY: "Today only",
  PREVIOUS_DAY: "Yesterday only",
  WEEK_TO_DATE: "From start of current week to today",
  MONTH_TO_DATE: "From start of current month to today",
  QUARTER_TO_DATE: "From start of current quarter to today",
  YEAR_TO_DATE: "From start of current year to today",
  PREVIOUS_WEEK: "Last complete week",
  PREVIOUS_MONTH: "Last complete month",
  PREVIOUS_QUARTER: "Last complete quarter",
  PREVIOUS_YEAR: "Last complete year",
  LAST_7_DAYS: "Last 7 days",
  LAST_14_DAYS: "Last 14 days",
  LAST_30_DAYS: "Last 30 days",
  LAST_60_DAYS: "Last 60 days",
  LAST_90_DAYS: "Last 90 days",
  LAST_365_DAYS: "Last 365 days",
  ALL_TIME: "All available data"
};

/**
 * Check if a string is a valid report type
 */
export function isValidReportType(value: string): value is ReportType {
  return ReportTypeSchema.safeParse(value).success;
}

/**
 * Check if a string is a valid data range
 */
export function isValidDataRange(value: string): value is DataRange {
  return DataRangeSchema.safeParse(value).success;
}
`;
}

function generateIndexModule(): string {
  return `// AUTO-GENERATED - DO NOT EDIT
// Barrel export for all generated types
// Run 'pnpm run generate' to regenerate

export {
  FilterTypeSchema,
  type FilterType,
  type FilterMetadata,
  FILTER_METADATA,
  FILTER_CATEGORIES,
  type FilterCategory,
  getFiltersByCategory,
  getGroupByFilters,
  isValidFilterType
} from "./filters.js";

export {
  MetricTypeSchema,
  type MetricType,
  type MetricMetadata,
  METRIC_METADATA,
  METRIC_CATEGORIES,
  type MetricCategory,
  getMetricsByCategory,
  isValidMetricType,
  COMMON_METRIC_SETS
} from "./metrics.js";

export {
  ReportTypeSchema,
  type ReportType,
  type ReportTypeMetadata,
  REPORT_TYPE_METADATA,
  DataRangeSchema,
  type DataRange,
  DATA_RANGE_DESCRIPTIONS,
  isValidReportType,
  isValidDataRange
} from "./report-types.js";

// Compatibility rules (manually maintained)
export {
  type CompatibilityRule,
  type IncompatibleCombination,
  REPORT_TYPE_RESTRICTIONS,
  INCOMPATIBLE_COMBINATIONS,
  GROUP_BY_ONLY_FILTERS,
  getCompatibilityWarnings,
  getMetricsForReportType,
  BEST_PRACTICES
} from "./compatibility-rules.js";
`;
}

main().catch((error) => {
  console.error("❌ Error generating types:", error);
  process.exit(1);
});
