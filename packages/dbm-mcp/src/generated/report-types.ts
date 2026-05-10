// AUTO-GENERATED - DO NOT EDIT
// Generated from data/bid-manager-reference.json
// Run 'pnpm run generate' to regenerate

import { z } from "zod";

/**
 * Available Bid Manager report types
 */
export const ReportTypeSchema = z.enum([
  "AUDIENCE_COMPOSITION",
  "FLOODLIGHT",
  "GRP",
  "REACH",
  "STANDARD",
  "UNIQUE_REACH_AUDIENCE",
  "YOUTUBE",
  "YOUTUBE_PROGRAMMATIC_GUARANTEED",
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
  STANDARD: {
    displayName: "Standard",
    description: "Standard delivery metrics - most common report type",
  },
  AUDIENCE_COMPOSITION: {
    displayName: "Audience Composition",
    description: "Audience demographic breakdowns (deprecated but functional)",
  },
  FLOODLIGHT: {
    displayName: "Floodlight",
    description: "Conversion tracking reports",
  },
  YOUTUBE: {
    displayName: "YouTube",
    description: "YouTube-specific metrics",
  },
  GRP: {
    displayName: "GRP",
    description: "Gross Rating Point reports",
  },
  YOUTUBE_PROGRAMMATIC_GUARANTEED: {
    displayName: "YouTube Programmatic Guaranteed",
    description: "YouTube Programmatic Guaranteed reports",
  },
  REACH: {
    displayName: "Reach",
    description: "Reach and frequency reports",
  },
  UNIQUE_REACH_AUDIENCE: {
    displayName: "Unique Reach Audience",
    description: "Unique reach by audience",
  },
};

/**
 * Available date range presets
 */
export const DataRangeSchema = z.enum([
  "RANGE_UNSPECIFIED",
  "CUSTOM_DATES",
  "CURRENT_DAY",
  "PREVIOUS_DAY",
  "WEEK_TO_DATE",
  "MONTH_TO_DATE",
  "QUARTER_TO_DATE",
  "YEAR_TO_DATE",
  "PREVIOUS_WEEK",
  "PREVIOUS_MONTH",
  "PREVIOUS_QUARTER",
  "PREVIOUS_YEAR",
  "LAST_7_DAYS",
  "LAST_14_DAYS",
  "LAST_30_DAYS",
  "LAST_60_DAYS",
  "LAST_90_DAYS",
  "LAST_365_DAYS",
  "ALL_TIME",
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
  ALL_TIME: "All available data",
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
