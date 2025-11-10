import { z } from "zod";

/**
 * Platform enum
 */
export const platformSchema = z.enum(["dv360", "google_ads", "meta", "ttd", "amazon"]);

export type Platform = z.infer<typeof platformSchema>;

/**
 * Delivery metrics schema
 */
export const deliveryMetricsSchema = z.object({
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  spend: z.number().nonnegative(),
  conversions: z.number().nonnegative().default(0),
  revenue: z.number().nonnegative().default(0),
});

export type DeliveryMetrics = z.infer<typeof deliveryMetricsSchema>;

/**
 * Performance metrics schema (calculated KPIs)
 */
export const performanceMetricsSchema = z.object({
  cpm: z.number().nonnegative(),
  ctr: z.number().nonnegative(),
  cpc: z.number().nonnegative().optional(),
  cpa: z.number().nonnegative().optional(),
  roas: z.number().nonnegative().optional(),
  conversionRate: z.number().nonnegative().optional(),
});

export type PerformanceMetrics = z.infer<typeof performanceMetricsSchema>;

/**
 * Time-series data point schema
 */
export const timeSeriesDataPointSchema = z.object({
  date: z.string(),
  metrics: deliveryMetricsSchema,
  performance: performanceMetricsSchema.optional(),
});

export type TimeSeriesDataPoint = z.infer<typeof timeSeriesDataPointSchema>;

/**
 * Pacing status schema
 */
export const pacingStatusSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  budget: z.number().nonnegative(),
  spend: z.number().nonnegative(),
  flightStartDate: z.string(),
  flightEndDate: z.string(),
  daysElapsed: z.number().int().nonnegative(),
  totalDays: z.number().int().positive(),
  expectedSpend: z.number().nonnegative(),
  pacingPercent: z.number(),
  pacingOffset: z.number(),
  isPacingCorrect: z.boolean(),
  deliveryStatus: z.enum(["underpacing", "overpacing", "on_track"]),
});

export type PacingStatus = z.infer<typeof pacingStatusSchema>;
