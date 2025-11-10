import { z } from "zod";

/**
 * Optimization strategy enum
 */
export const optimizationStrategySchema = z.enum(["aggressive", "moderate", "conservative"]);

export type OptimizationStrategy = z.infer<typeof optimizationStrategySchema>;

/**
 * Adjustment type enum
 */
export const adjustmentTypeSchema = z.enum(["bid_increase", "bid_decrease", "margin_increase", "margin_decrease", "no_change"]);

export type AdjustmentType = z.infer<typeof adjustmentTypeSchema>;

/**
 * Bid adjustment schema
 */
export const bidAdjustmentSchema = z.object({
  lineItemId: z.string(),
  lineItemName: z.string(),
  currentBidMicros: z.number().int().nonnegative(),
  recommendedBidMicros: z.number().int().nonnegative(),
  adjustmentPercent: z.number(),
  adjustmentType: adjustmentTypeSchema,
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

export type BidAdjustment = z.infer<typeof bidAdjustmentSchema>;

/**
 * Margin adjustment schema
 */
export const marginAdjustmentSchema = z.object({
  lineItemId: z.string(),
  lineItemName: z.string(),
  currentMarginPercent: z.number().nonnegative(),
  recommendedMarginPercent: z.number().nonnegative(),
  adjustmentPercent: z.number(),
  adjustmentType: adjustmentTypeSchema,
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

export type MarginAdjustment = z.infer<typeof marginAdjustmentSchema>;

/**
 * Optimization recommendation schema
 */
export const optimizationRecommendationSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  bidAdjustments: z.array(bidAdjustmentSchema),
  marginAdjustments: z.array(marginAdjustmentSchema),
  estimatedImpact: z.object({
    expectedSpendChange: z.number(),
    expectedDeliveryChange: z.number(),
  }),
  priority: z.enum(["high", "medium", "low"]),
  generatedAt: z.string(),
});

export type OptimizationRecommendation = z.infer<typeof optimizationRecommendationSchema>;

/**
 * Adjustment history entry schema
 */
export const adjustmentHistoryEntrySchema = z.object({
  id: z.string(),
  lineItemId: z.string(),
  lineItemName: z.string(),
  adjustmentType: adjustmentTypeSchema,
  previousValue: z.number(),
  newValue: z.number(),
  adjustmentPercent: z.number(),
  reason: z.string(),
  appliedAt: z.string(),
  appliedBy: z.string(),
  outcome: z.object({
    deliveryChangePercent: z.number().optional(),
    pacingImprovement: z.boolean().optional(),
    evaluatedAt: z.string().optional(),
  }).optional(),
});

export type AdjustmentHistoryEntry = z.infer<typeof adjustmentHistoryEntrySchema>;

/**
 * Optimization configuration schema
 */
export const optimizationConfigSchema = z.object({
  strategy: optimizationStrategySchema,
  maxAdjustmentPercent: z.number().min(0).max(100).default(2),
  minImpressions: z.number().int().nonnegative().default(1000),
  pacingTargetPercent: z.number().min(0).max(100).default(95),
  pacingTolerancePercent: z.number().min(0).max(100).default(5),
  enableAutoAdjustments: z.boolean().default(true),
  enableMarginOptimization: z.boolean().default(false),
});

export type OptimizationConfig = z.infer<typeof optimizationConfigSchema>;

/**
 * Pacing forecast schema
 */
export const pacingForecastSchema = z.object({
  campaignId: z.string(),
  currentSpend: z.number().nonnegative(),
  projectedSpend: z.number().nonnegative(),
  budget: z.number().nonnegative(),
  projectedPacingPercent: z.number(),
  daysRemaining: z.number().int().nonnegative(),
  recommendedDailySpend: z.number().nonnegative(),
  currentDailyRunRate: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
});

export type PacingForecast = z.infer<typeof pacingForecastSchema>;
