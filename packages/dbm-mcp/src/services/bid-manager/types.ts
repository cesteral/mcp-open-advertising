/**
 * Bid Manager API v2 Types and Zod Schemas
 *
 * Comprehensive type definitions for Bid Manager API queries and reports.
 * Based on: https://developers.google.com/bid-manager/reference/rest/v2
 */

import { z } from "zod";

// =============================================================================
// ENUMS - Available values for Bid Manager API queries
// =============================================================================

/**
 * Report type - determines the report structure
 * Per Bid Manager API v2: https://doubleclickbidmanager.googleapis.com/$discovery/rest?version=v2
 */
export const ReportTypeSchema = z.enum([
  "STANDARD", // Standard delivery metrics (most common)
  "FLOODLIGHT", // Conversion tracking reports
  "YOUTUBE", // YouTube-specific metrics
  "GRP", // Gross Rating Point reports
  "YOUTUBE_PROGRAMMATIC_GUARANTEED", // YouTube PG reports
  "REACH", // Reach reports
  "UNIQUE_REACH_AUDIENCE", // Unique reach by audience
  "REPORT_TYPE_UNSPECIFIED", // Default/unset
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

/**
 * Data range presets
 * Per Bid Manager API v2: https://doubleclickbidmanager.googleapis.com/$discovery/rest?version=v2
 */
export const DataRangeSchema = z.enum([
  "RANGE_UNSPECIFIED", // Default/unset
  "CUSTOM_DATES", // Use customStartDate/customEndDate
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
 * Report format
 */
export const ReportFormatSchema = z.enum(["CSV", "XLSX"]);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

/**
 * Filter/dimension types - used for groupBys and filters
 */
export const FilterTypeSchema = z.enum([
  // Time dimensions
  "FILTER_DATE",
  "FILTER_MONTH",
  "FILTER_YEAR",
  "FILTER_WEEK",
  "FILTER_TIME_OF_DAY",
  "FILTER_DAY_OF_WEEK",

  // Entity hierarchy
  "FILTER_PARTNER",
  "FILTER_ADVERTISER",
  "FILTER_MEDIA_PLAN",
  "FILTER_INSERTION_ORDER",
  "FILTER_LINE_ITEM",
  "FILTER_CREATIVE",

  // Targeting dimensions
  "FILTER_DEVICE_TYPE",
  "FILTER_BROWSER",
  "FILTER_COUNTRY",
  "FILTER_REGION",
  "FILTER_CITY",
  "FILTER_DMA",
  "FILTER_OS",

  // Audience
  "FILTER_AUDIENCE_LIST",
  "FILTER_AGE",
  "FILTER_GENDER",
  "FILTER_HOUSEHOLD_INCOME",
  "FILTER_PARENTAL_STATUS",

  // Inventory
  "FILTER_INVENTORY_SOURCE",
  "FILTER_INVENTORY_SOURCE_TYPE",
  "FILTER_EXCHANGE",
  "FILTER_SITE_ID",
  "FILTER_APP_URL",

  // Video
  "FILTER_VIDEO_PLAYER_SIZE",
  "FILTER_VIDEO_CREATIVE_DURATION",
  "FILTER_VIDEO_AD_POSITION",

  // Other
  "FILTER_ORDER_ID",
  "FILTER_TRUEVIEW_CONVERSION_TYPE",
]);
export type FilterType = z.infer<typeof FilterTypeSchema>;

/**
 * Metric types - available measurements in reports
 */
export const MetricTypeSchema = z.enum([
  // Core delivery metrics
  "METRIC_IMPRESSIONS",
  "METRIC_CLICKS",
  "METRIC_CTR", // Click-through rate
  "METRIC_TOTAL_CONVERSIONS",
  "METRIC_POST_CLICK_CONVERSIONS",
  "METRIC_POST_VIEW_CONVERSIONS",

  // Cost metrics
  "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
  "METRIC_TOTAL_MEDIA_COST_PARTNER",
  "METRIC_TOTAL_MEDIA_COST_USD",
  "METRIC_CPM_ADVERTISER",
  "METRIC_CPM_PARTNER",
  "METRIC_CPM_USD",
  "METRIC_CPC_ADVERTISER",
  "METRIC_CPA_ADVERTISER",

  // Revenue metrics
  "METRIC_REVENUE_ADVERTISER",
  "METRIC_REVENUE_PARTNER",
  "METRIC_REVENUE_USD",

  // Viewability metrics (Active View)
  "METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS",
  "METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
  "METRIC_ACTIVE_VIEW_ELIGIBLE_IMPRESSIONS",
  "METRIC_ACTIVE_VIEW_PCT_MEASURABLE_IMPRESSIONS",
  "METRIC_ACTIVE_VIEW_PCT_VIEWABLE_IMPRESSIONS",

  // Video metrics
  "METRIC_VIDEO_PLAYS",
  "METRIC_VIDEO_COMPLETIONS",
  "METRIC_VIDEO_COMPLETION_RATE",
  "METRIC_VIDEO_FIRST_QUARTILE_COMPLETIONS",
  "METRIC_VIDEO_MIDPOINTS",
  "METRIC_VIDEO_THIRD_QUARTILE_COMPLETIONS",
  "METRIC_VIDEO_SKIPS",
  "METRIC_VIDEO_PAUSE_EVENTS",
  "METRIC_VIDEO_MUTES",
  "METRIC_VIDEO_UNMUTES",

  // Rich media metrics
  "METRIC_RICH_MEDIA_VIDEO_PLAYS",
  "METRIC_RICH_MEDIA_VIDEO_COMPLETIONS",
  "METRIC_RICH_MEDIA_SCROLLS",
  "METRIC_RICH_MEDIA_ENGAGEMENTS",
  "METRIC_RICH_MEDIA_EXPANSIONS",
  "METRIC_RICH_MEDIA_FULL_SCREEN_IMPRESSIONS",

  // Reach and frequency
  "METRIC_UNIQUE_REACH_IMPRESSION_REACH",
  "METRIC_UNIQUE_REACH_CLICK_REACH",
  "METRIC_UNIQUE_REACH_TOTAL_REACH",
  "METRIC_UNIQUE_REACH_AVERAGE_IMPRESSION_FREQUENCY",

  // Floodlight/Conversion metrics
  "METRIC_FLOODLIGHT_IMPRESSIONS",
  "METRIC_FLOODLIGHT_CLICKS",
  "METRIC_CM_POST_CLICK_REVENUE",
  "METRIC_CM_POST_VIEW_REVENUE",

  // TrueView metrics
  "METRIC_TRUEVIEW_VIEWS",
  "METRIC_TRUEVIEW_VIEW_RATE",
  "METRIC_TRUEVIEW_EARNED_VIEWS",
  "METRIC_TRUEVIEW_EARNED_SUBSCRIBERS",
  "METRIC_TRUEVIEW_EARNED_PLAYLIST_ADDITIONS",
  "METRIC_TRUEVIEW_EARNED_SHARES",
]);
export type MetricType = z.infer<typeof MetricTypeSchema>;

/**
 * Report status
 * Per Bid Manager API v2: https://doubleclickbidmanager.googleapis.com/$discovery/rest?version=v2
 */
export const ReportStatusSchema = z.enum([
  "STATE_UNSPECIFIED", // Default/unset
  "QUEUED",
  "RUNNING",
  "DONE",
  "FAILED",
]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

// =============================================================================
// OBJECT SCHEMAS - Complex types for API requests/responses
// =============================================================================

/**
 * Date object for API (year, month, day)
 */
export const DateObjectSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});
export type DateObject = z.infer<typeof DateObjectSchema>;

/**
 * Query filter - used to filter report data
 */
export const QueryFilterSchema = z.object({
  type: FilterTypeSchema,
  value: z.string(),
});
export type QueryFilter = z.infer<typeof QueryFilterSchema>;

/**
 * Data range configuration
 */
export const DataRangeConfigSchema = z.object({
  range: DataRangeSchema,
  customStartDate: DateObjectSchema.optional(),
  customEndDate: DateObjectSchema.optional(),
});
export type DataRangeConfig = z.infer<typeof DataRangeConfigSchema>;

/**
 * Query metadata - title, date range, format
 */
export const QueryMetadataSchema = z.object({
  title: z.string().min(1).max(1024),
  dataRange: DataRangeConfigSchema,
  format: ReportFormatSchema.default("CSV"),
});
export type QueryMetadata = z.infer<typeof QueryMetadataSchema>;

/**
 * Query parameters - type, groupBys, metrics, filters
 */
export const QueryParamsSchema = z.object({
  type: ReportTypeSchema.default("STANDARD"),
  groupBys: z.array(FilterTypeSchema).min(1),
  metrics: z.array(MetricTypeSchema).min(1),
  filters: z.array(QueryFilterSchema).optional(),
});
export type QueryParams = z.infer<typeof QueryParamsSchema>;

/**
 * Full query specification for creating a report
 */
export const QuerySpecSchema = z.object({
  metadata: QueryMetadataSchema,
  params: QueryParamsSchema,
});
export type QuerySpec = z.infer<typeof QuerySpecSchema>;

/**
 * Report key - identifies a specific report
 */
export const ReportKeySchema = z.object({
  queryId: z.string(),
  reportId: z.string(),
});
export type ReportKey = z.infer<typeof ReportKeySchema>;

/**
 * Report status details
 */
export const ReportStatusDetailsSchema = z.object({
  state: ReportStatusSchema,
  format: z.string().optional(),
});
export type ReportStatusDetails = z.infer<typeof ReportStatusDetailsSchema>;

/**
 * Report metadata from API response
 */
export const ReportMetadataSchema = z.object({
  status: ReportStatusDetailsSchema,
  googleCloudStoragePath: z.string().optional(),
});
export type ReportMetadata = z.infer<typeof ReportMetadataSchema>;

// =============================================================================
// RESULT SCHEMAS - Parsed report data
// =============================================================================

/**
 * Delivery metrics - core metrics from reports
 */
export const DeliveryMetricsSchema = z.object({
  impressions: z.number().int().min(0),
  clicks: z.number().int().min(0),
  spend: z.number().min(0),
  conversions: z.number().int().min(0),
  revenue: z.number().min(0),
});
export type DeliveryMetrics = z.infer<typeof DeliveryMetricsSchema>;

/**
 * Performance metrics - derived KPIs calculated from delivery metrics
 */
export const PerformanceMetricsSchema = DeliveryMetricsSchema.extend({
  cpm: z.number().min(0), // Cost per mille (spend / impressions * 1000)
  ctr: z.number().min(0).max(100), // Click-through rate (clicks / impressions * 100)
  cpc: z.number().min(0), // Cost per click (spend / clicks)
  cpa: z.number().min(0), // Cost per acquisition (spend / conversions)
  roas: z.number().min(0), // Return on ad spend (revenue / spend)
});
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

/**
 * Historical data point - metrics for a specific date
 */
export const HistoricalDataPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metrics: DeliveryMetricsSchema,
});
export type HistoricalDataPoint = z.infer<typeof HistoricalDataPointSchema>;

/**
 * Pacing status - delivery progress vs expectations
 */
export const PacingStatusSchema = z.object({
  advertiserId: z.string(),
  campaignId: z.string(),
  budgetTotal: z.number().min(0),
  spendToDate: z.number().min(0),
  expectedDeliveryPercent: z.number().min(0).max(100),
  actualDeliveryPercent: z.number().min(0).max(100),
  pacingRatio: z.number().min(0), // actual / expected
  status: z.enum(["ON_PACE", "AHEAD", "BEHIND", "SEVERELY_BEHIND"]),
  daysRemaining: z.number().int().min(0),
  projectedEndSpend: z.number().min(0),
});
export type PacingStatus = z.infer<typeof PacingStatusSchema>;

// =============================================================================
// SERVICE INPUT SCHEMAS - Parameters for BidManagerService methods
// =============================================================================

/**
 * Input for getDeliveryMetrics
 */
export const GetDeliveryMetricsInputSchema = z.object({
  advertiserId: z.string().min(1),
  campaignId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type GetDeliveryMetricsInput = z.infer<typeof GetDeliveryMetricsInputSchema>;

/**
 * Input for getHistoricalMetrics
 */
export const GetHistoricalMetricsInputSchema = z.object({
  advertiserId: z.string().min(1),
  campaignId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});
export type GetHistoricalMetricsInput = z.infer<typeof GetHistoricalMetricsInputSchema>;

/**
 * Input for getPacingStatus
 */
export const GetPacingStatusInputSchema = z.object({
  advertiserId: z.string().min(1),
  campaignId: z.string().min(1),
  budgetTotal: z.number().min(0),
  flightStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  flightEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type GetPacingStatusInput = z.infer<typeof GetPacingStatusInputSchema>;

// =============================================================================
// RETRY/RESILIENCE SCHEMAS - Exponential backoff and query continuation
// =============================================================================

/**
 * Configuration for exponential backoff polling
 */
export const ExponentialBackoffConfigSchema = z.object({
  initialDelayMs: z.number().int().min(100).default(2000),
  maxDelayMs: z.number().int().min(1000).default(60000),
  maxRetries: z.number().int().min(1).default(10),
  backoffMultiplier: z.number().min(1).default(2),
});
export type ExponentialBackoffConfig = z.infer<typeof ExponentialBackoffConfigSchema>;

/**
 * State for query continuation across retries
 * Tracks progress so we can resume from where we left off
 */
export const QueryContinuationStateSchema = z.object({
  queryId: z.string().optional(),
  reportId: z.string().optional(),
  lastStatus: ReportStatusSchema.optional(),
  attemptCount: z.number().int().min(0).default(0),
  gcsPath: z.string().optional(),
});
export type QueryContinuationState = z.infer<typeof QueryContinuationStateSchema>;

// =============================================================================
// CSV COLUMN MAPPINGS - Maps API metric names to CSV column headers
// =============================================================================

/**
 * CSV column header mappings for common metrics
 * Note: These may vary based on report type and locale
 */
export const CSV_COLUMN_MAPPINGS: Record<string, MetricType> = {
  Impressions: "METRIC_IMPRESSIONS",
  Clicks: "METRIC_CLICKS",
  "Click Rate": "METRIC_CTR",
  "Total Conversions": "METRIC_TOTAL_CONVERSIONS",
  "Post-Click Conversions": "METRIC_POST_CLICK_CONVERSIONS",
  "Post-View Conversions": "METRIC_POST_VIEW_CONVERSIONS",
  "Media Cost (Advertiser Currency)": "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
  "Media Cost (Partner Currency)": "METRIC_TOTAL_MEDIA_COST_PARTNER",
  "Media Cost (USD)": "METRIC_TOTAL_MEDIA_COST_USD",
  "Revenue (Advertiser Currency)": "METRIC_REVENUE_ADVERTISER",
  "Revenue (Partner Currency)": "METRIC_REVENUE_PARTNER",
  "Revenue (USD)": "METRIC_REVENUE_USD",
  "Active View: Measurable Impressions": "METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS",
  "Active View: Viewable Impressions": "METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
  "Video Plays": "METRIC_VIDEO_PLAYS",
  "Video Completions": "METRIC_VIDEO_COMPLETIONS",
  "Video Completion Rate": "METRIC_VIDEO_COMPLETION_RATE",
};

/**
 * Reverse mapping: MetricType to CSV column header
 */
export const METRIC_TO_CSV_COLUMN: Record<MetricType, string> = Object.fromEntries(
  Object.entries(CSV_COLUMN_MAPPINGS).map(([col, metric]) => [metric, col])
) as Record<MetricType, string>;
