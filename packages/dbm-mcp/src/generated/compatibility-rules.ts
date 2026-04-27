// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Compatibility Rules for Bid Manager API Queries
 *
 * This module documents known restrictions and requirements for using
 * filters and metrics together in different report types.
 *
 * IMPORTANT: These rules are based on naming conventions and Google's
 * documentation. The Bid Manager API performs its own validation and
 * will return HTTP 400 for invalid combinations.
 */

import type { ReportType } from "./report-types.js";

/**
 * Describes a compatibility rule for metrics/filters
 */
export interface CompatibilityRule {
  /** Human-readable description of the rule */
  description: string;
  /** Pattern to match metric names (if applicable) */
  metricsPattern?: RegExp;
  /** Pattern to match filter names (if applicable) */
  filtersPattern?: RegExp;
  /** Report types where this rule applies */
  reportTypes: ReportType[];
  /** Whether items matching this pattern are EXCLUSIVE to these report types */
  exclusive?: boolean;
}

/**
 * Report type restrictions based on naming conventions
 *
 * Source: https://developers.google.com/bid-manager/guides/general/best-practices
 */
export const REPORT_TYPE_RESTRICTIONS: CompatibilityRule[] = [
  {
    description: "TrueView metrics are only available in YOUTUBE reports",
    metricsPattern: /^METRIC_TRUEVIEW/,
    reportTypes: ["YOUTUBE"],
    exclusive: true,
  },
  {
    description: "TrueView filters are only available in YOUTUBE reports",
    filtersPattern: /^FILTER_TRUEVIEW/,
    reportTypes: ["YOUTUBE"],
    exclusive: true,
  },
  {
    description: "Active View TrueView metrics are only available in YOUTUBE reports",
    metricsPattern: /_TRUEVIEW_/,
    reportTypes: ["YOUTUBE"],
    exclusive: true,
  },
  {
    description: "Unique Reach metrics require REACH or UNIQUE_REACH_AUDIENCE report type",
    metricsPattern: /^METRIC_UNIQUE_REACH/,
    reportTypes: ["REACH", "UNIQUE_REACH_AUDIENCE"],
    exclusive: true,
  },
  {
    description: "GRP metrics require GRP report type",
    metricsPattern: /^METRIC_GRP/,
    reportTypes: ["GRP"],
    exclusive: true,
  },
  {
    description: "Nielsen filters require GRP report type",
    filtersPattern: /^FILTER_NIELSEN/,
    reportTypes: ["GRP"],
    exclusive: true,
  },
  {
    description:
      "YouTube Programmatic Guaranteed filters require YOUTUBE_PROGRAMMATIC_GUARANTEED report type",
    filtersPattern: /YOUTUBE_PROGRAMMATIC_GUARANTEED/,
    reportTypes: ["YOUTUBE_PROGRAMMATIC_GUARANTEED"],
    exclusive: true,
  },
  {
    description:
      "Programmatic Guaranteed metrics require YOUTUBE_PROGRAMMATIC_GUARANTEED report type",
    metricsPattern: /^METRIC_PROGRAMMATIC_GUARANTEED/,
    reportTypes: ["YOUTUBE_PROGRAMMATIC_GUARANTEED"],
    exclusive: true,
  },
  {
    description: "Floodlight metrics/filters work with STANDARD and FLOODLIGHT reports",
    metricsPattern: /FLOODLIGHT/,
    filtersPattern: /FLOODLIGHT/,
    reportTypes: ["STANDARD", "FLOODLIGHT"],
    exclusive: false,
  },
];

/**
 * Known incompatible combinations (beyond report type restrictions)
 */
export interface IncompatibleCombination {
  description: string;
  incompatibleItems: {
    metrics?: string[];
    filters?: string[];
  };
  reason: string;
}

export const INCOMPATIBLE_COMBINATIONS: IncompatibleCombination[] = [
  {
    description: "Reach metrics have limited filter compatibility",
    incompatibleItems: {
      metrics: [
        "METRIC_UNIQUE_REACH_IMPRESSION_REACH",
        "METRIC_UNIQUE_REACH_CLICK_REACH",
        "METRIC_UNIQUE_REACH_TOTAL_REACH",
        "METRIC_UNIQUE_REACH_AVERAGE_IMPRESSION_FREQUENCY",
      ],
    },
    reason:
      "Reach metrics can only be used with a limited set of groupBys due to privacy thresholds. " +
      "Use coarse dimensions like FILTER_DATE, FILTER_ADVERTISER, FILTER_MEDIA_PLAN, FILTER_INSERTION_ORDER.",
  },
];

/**
 * GroupBy-only filters (cannot be used as filters, only as dimensions)
 */
export const GROUP_BY_ONLY_FILTERS = [
  "FILTER_DATE",
  "FILTER_DAY_OF_WEEK",
  "FILTER_MONTH",
  "FILTER_WEEK",
  "FILTER_QUARTER",
  "FILTER_YEAR",
  "FILTER_TIME_OF_DAY",
  "FILTER_UTC_DATE",
];

/**
 * Get compatibility warnings for a query configuration
 *
 * Returns an array of warning messages for potential issues.
 * These are informational only - the API will perform actual validation.
 */
export function getCompatibilityWarnings(
  reportType: string,
  metrics: string[],
  filters: string[],
  groupBys: string[]
): string[] {
  const warnings: string[] = [];

  // Check metrics against report type restrictions
  for (const rule of REPORT_TYPE_RESTRICTIONS) {
    if (rule.metricsPattern && rule.exclusive) {
      for (const metric of metrics) {
        if (
          rule.metricsPattern.test(metric) &&
          !rule.reportTypes.includes(reportType as ReportType)
        ) {
          warnings.push(
            `Warning: ${metric} is typically only available in ${rule.reportTypes.join(", ")} reports, ` +
              `but you're using ${reportType}. ${rule.description}`
          );
        }
      }
    }
  }

  // Check filters against report type restrictions
  for (const rule of REPORT_TYPE_RESTRICTIONS) {
    if (rule.filtersPattern && rule.exclusive) {
      const allFilters = [...filters, ...groupBys];
      for (const filter of allFilters) {
        if (
          rule.filtersPattern.test(filter) &&
          !rule.reportTypes.includes(reportType as ReportType)
        ) {
          warnings.push(
            `Warning: ${filter} is typically only available in ${rule.reportTypes.join(", ")} reports, ` +
              `but you're using ${reportType}. ${rule.description}`
          );
        }
      }
    }
  }

  // Check for groupBy-only filters used as filters
  for (const filter of filters) {
    if (GROUP_BY_ONLY_FILTERS.includes(filter)) {
      warnings.push(
        `Warning: ${filter} should only be used as a groupBy dimension, not as a filter. ` +
          `It may cause errors if used in the filters array.`
      );
    }
  }

  // Check for known incompatible combinations
  for (const combo of INCOMPATIBLE_COMBINATIONS) {
    if (combo.incompatibleItems.metrics) {
      const matchingMetrics = metrics.filter((m) => combo.incompatibleItems.metrics!.includes(m));
      if (matchingMetrics.length > 0) {
        warnings.push(`Note: ${combo.description}. ${combo.reason}`);
      }
    }
  }

  return warnings;
}

/**
 * Get metrics compatible with a specific report type
 */
export function getMetricsForReportType(reportType: ReportType): {
  exclusive: string[];
  general: string[];
} {
  const exclusive: string[] = [];
  const general: string[] = [];

  // Find exclusive metrics for this report type
  for (const rule of REPORT_TYPE_RESTRICTIONS) {
    if (rule.metricsPattern && rule.exclusive && rule.reportTypes.includes(reportType)) {
      // This is a pattern for metrics exclusive to this report type
      exclusive.push(rule.metricsPattern.source);
    }
  }

  return { exclusive, general };
}

/**
 * Best practices for building queries
 */
export const BEST_PRACTICES = [
  "Build new reports in the DV360 UI first to validate metric/filter combinations before implementing via API.",
  "Use STANDARD report type for most general queries - it supports the widest range of filters and metrics.",
  "Use report-type-specific metrics only with their intended report types (e.g., METRIC_TRUEVIEW_* with YOUTUBE).",
  "Time-based dimensions (DATE, WEEK, MONTH, etc.) can only be used as groupBys, not as filters.",
  "Reach metrics have privacy thresholds and may return incomplete data with granular dimensions.",
  "When combining reports with identical metrics and date ranges, consolidate filters and add filter types as dimensions.",
];
