// AUTO-GENERATED - DO NOT EDIT
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
