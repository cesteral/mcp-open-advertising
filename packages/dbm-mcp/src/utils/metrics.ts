// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Declarative metric calculations
 *
 * Provides a configuration-driven approach to calculating performance metrics,
 * eliminating duplication and ensuring consistency across the codebase.
 */

import type { DeliveryMetrics, PerformanceMetrics } from "../services/bid-manager/types.js";
import { safeDivide, safePercentage, safePerMille, round } from "./math.js";

/**
 * Configuration for a single metric calculation
 */
export interface MetricConfig {
  /** Field name for the numerator */
  numerator: keyof DeliveryMetrics;
  /** Field name for the denominator */
  denominator: keyof DeliveryMetrics;
  /** Multiplier to apply after division (default: 1) */
  multiplier?: number;
  /** Human-readable description */
  description: string;
  /** Unit for display (e.g., "$", "%") */
  unit?: string;
}

/**
 * Calculated performance metric keys (derived metrics)
 */
export type PerformanceMetricKey = "cpm" | "ctr" | "cpc" | "cpa" | "roas";

/**
 * Declarative configuration for all performance metrics
 *
 * Single source of truth for metric formulas:
 * - CPM: Cost per mille (spend / impressions * 1000)
 * - CTR: Click-through rate (clicks / impressions * 100)
 * - CPC: Cost per click (spend / clicks)
 * - CPA: Cost per acquisition (spend / conversions)
 * - ROAS: Return on ad spend (revenue / spend)
 */
export const PERFORMANCE_METRICS: Record<PerformanceMetricKey, MetricConfig> = {
  cpm: {
    numerator: "spend",
    denominator: "impressions",
    multiplier: 1000,
    description: "Cost per thousand impressions",
    unit: "$",
  },
  ctr: {
    numerator: "clicks",
    denominator: "impressions",
    multiplier: 100,
    description: "Click-through rate",
    unit: "%",
  },
  cpc: {
    numerator: "spend",
    denominator: "clicks",
    multiplier: 1,
    description: "Cost per click",
    unit: "$",
  },
  cpa: {
    numerator: "spend",
    denominator: "conversions",
    multiplier: 1,
    description: "Cost per acquisition/conversion",
    unit: "$",
  },
  roas: {
    numerator: "revenue",
    denominator: "spend",
    multiplier: 1,
    description: "Return on ad spend",
    unit: "x",
  },
};

/**
 * Calculates a single metric based on configuration
 *
 * @param metrics - Delivery metrics to calculate from
 * @param config - Metric configuration
 * @returns Calculated metric value (0 if division not possible)
 */
export function calculateMetric(metrics: DeliveryMetrics, config: MetricConfig): number {
  const numeratorValue = metrics[config.numerator];
  const denominatorValue = metrics[config.denominator];
  const multiplier = config.multiplier ?? 1;

  const result = safeDivide(numeratorValue, denominatorValue, 0) * multiplier;
  return round(result);
}

/**
 * Calculates all performance metrics from delivery metrics
 *
 * Returns a PerformanceMetrics object containing:
 * - All original delivery metrics (impressions, clicks, spend, conversions, revenue)
 * - All calculated metrics (cpm, ctr, cpc, cpa, roas)
 *
 * @param delivery - Delivery metrics to calculate from
 * @returns Full performance metrics object
 */
export function calculateAllMetrics(delivery: DeliveryMetrics): PerformanceMetrics {
  return {
    // Spread base delivery metrics
    ...delivery,

    // Calculate derived metrics
    cpm: calculateMetric(delivery, PERFORMANCE_METRICS.cpm),
    ctr: calculateMetric(delivery, PERFORMANCE_METRICS.ctr),
    cpc: calculateMetric(delivery, PERFORMANCE_METRICS.cpc),
    cpa: calculateMetric(delivery, PERFORMANCE_METRICS.cpa),
    roas: calculateMetric(delivery, PERFORMANCE_METRICS.roas),
  };
}

/**
 * Calculates a specific performance metric by name
 *
 * @param metrics - Delivery metrics
 * @param metricName - Name of the metric to calculate
 * @returns Calculated metric value
 */
export function calculateMetricByName(
  metrics: DeliveryMetrics,
  metricName: PerformanceMetricKey
): number {
  const config = PERFORMANCE_METRICS[metricName];
  return calculateMetric(metrics, config);
}

/**
 * Convenience function: Calculate CPM from spend and impressions
 *
 * @param spend - Total spend amount
 * @param impressions - Total impressions
 * @returns CPM value (spend per 1000 impressions)
 */
export function calculateCPM(spend: number, impressions: number): number {
  return round(safePerMille(spend, impressions, 0));
}

/**
 * Convenience function: Calculate CTR from clicks and impressions
 *
 * @param clicks - Total clicks
 * @param impressions - Total impressions
 * @returns CTR percentage (0-100)
 */
export function calculateCTR(clicks: number, impressions: number): number {
  return round(safePercentage(clicks, impressions, 0));
}

/**
 * Convenience function: Calculate CPC from spend and clicks
 *
 * @param spend - Total spend amount
 * @param clicks - Total clicks
 * @returns CPC value (cost per click)
 */
export function calculateCPC(spend: number, clicks: number): number {
  return round(safeDivide(spend, clicks, 0));
}

/**
 * Convenience function: Calculate CPA from spend and conversions
 *
 * @param spend - Total spend amount
 * @param conversions - Total conversions
 * @returns CPA value (cost per acquisition)
 */
export function calculateCPA(spend: number, conversions: number): number {
  return round(safeDivide(spend, conversions, 0));
}

/**
 * Convenience function: Calculate ROAS from revenue and spend
 *
 * @param revenue - Total revenue
 * @param spend - Total spend amount
 * @returns ROAS multiplier
 */
export function calculateROAS(revenue: number, spend: number): number {
  return round(safeDivide(revenue, spend, 0));
}

/**
 * Formats a metric value for display
 *
 * @param metricName - Name of the metric
 * @param value - Metric value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with appropriate unit
 */
export function formatMetricValue(
  metricName: PerformanceMetricKey,
  value: number,
  decimals: number = 2
): string {
  const config = PERFORMANCE_METRICS[metricName];
  const formattedValue = round(value, decimals);

  switch (config.unit) {
    case "$":
      return `$${formattedValue.toFixed(decimals)}`;
    case "%":
      return `${formattedValue.toFixed(decimals)}%`;
    case "x":
      return `${formattedValue.toFixed(decimals)}x`;
    default:
      return formattedValue.toFixed(decimals);
  }
}

/**
 * Gets the description for a metric
 *
 * @param metricName - Name of the metric
 * @returns Human-readable description
 */
export function getMetricDescription(metricName: PerformanceMetricKey): string {
  return PERFORMANCE_METRICS[metricName].description;
}
