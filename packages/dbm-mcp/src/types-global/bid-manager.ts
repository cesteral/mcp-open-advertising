// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bid Manager API specific types
 * Based on Bid Manager API v2 (DV360 reporting)
 */

/**
 * Query metadata
 */
export interface QueryMetadata {
  title: string;
  dataRange: {
    range: "CUSTOM_DATES" | "LAST_7_DAYS" | "LAST_30_DAYS" | "PREVIOUS_MONTH";
    customStartDate?: DateObject;
    customEndDate?: DateObject;
  };
  format: "CSV" | "XLSX";
}

/**
 * Query parameters
 */
export interface QueryParams {
  type: QueryType;
  groupBys: FilterType[];
  metrics: MetricType[];
  filters?: QueryFilter[];
}

/**
 * Query filter
 */
export interface QueryFilter {
  type: FilterType;
  value: string;
}

/**
 * Query type enum
 */
export type QueryType =
  | "TYPE_GENERAL"
  | "TYPE_AUDIENCE_COMPOSITION"
  | "TYPE_REACH_FREQUENCY"
  | "TYPE_YOUTUBE";

/**
 * Filter/dimension types
 */
export type FilterType =
  | "FILTER_DATE"
  | "FILTER_ADVERTISER"
  | "FILTER_MEDIA_PLAN"
  | "FILTER_INSERTION_ORDER"
  | "FILTER_LINE_ITEM"
  | "FILTER_CREATIVE"
  | "FILTER_PARTNER"
  | "FILTER_DEVICE_TYPE"
  | "FILTER_COUNTRY";

/**
 * Metric types
 */
export type MetricType =
  | "METRIC_IMPRESSIONS"
  | "METRIC_CLICKS"
  | "METRIC_TOTAL_MEDIA_COST_ADVERTISER"
  | "METRIC_CONVERSIONS"
  | "METRIC_REVENUE_ADVERTISER"
  | "METRIC_CTR"
  | "METRIC_CPM"
  | "METRIC_CPC"
  | "METRIC_CPA"
  | "METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS"
  | "METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS";

/**
 * Date object for API
 */
export interface DateObject {
  year: number;
  month: number;
  day: number;
}

/**
 * Report status
 */
export type ReportStatus = "RUNNING" | "DONE" | "FAILED";

/**
 * Report metadata
 */
export interface ReportMetadata {
  status: {
    state: ReportStatus;
    format?: string;
  };
  googleCloudStoragePath?: string;
}

/**
 * Report key
 */
export interface ReportKey {
  queryId: string;
  reportId: string;
}

/**
 * Delivery metrics result
 */
export interface DeliveryMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
}

/**
 * Performance metrics result (derived KPIs)
 */
export interface PerformanceMetrics extends DeliveryMetrics {
  cpm: number; // Cost per mille (spend / impressions * 1000)
  ctr: number; // Click-through rate (clicks / impressions * 100)
  cpc: number; // Cost per click (spend / clicks)
  cpa: number; // Cost per acquisition (spend / conversions)
  roas: number; // Return on ad spend (revenue / spend)
}

/**
 * Historical metrics data point
 */
export interface HistoricalDataPoint {
  date: string; // YYYY-MM-DD
  metrics: DeliveryMetrics;
}

/**
 * Pacing status result
 */
export interface PacingStatus {
  advertiserId: string;
  campaignId: string;
  expectedDeliveryPercent: number;
  actualDeliveryPercent: number;
  pacingRatio: number; // actual / expected
  status: "ON_PACE" | "AHEAD" | "BEHIND" | "SEVERELY_BEHIND";
  daysRemaining: number;
  projectedEndSpend: number;
}

/**
 * Platform entity (campaign hierarchy)
 */
export interface PlatformEntity {
  id: string;
  name: string;
  type: "advertiser" | "campaign" | "insertionOrder" | "lineItem";
  status: "ACTIVE" | "PAUSED" | "DRAFT" | "ARCHIVED";
  parentId?: string;
  children?: PlatformEntity[];
}