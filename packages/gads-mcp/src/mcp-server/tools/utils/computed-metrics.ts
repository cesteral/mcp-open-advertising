// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Computed Metrics Utility
 *
 * Derives CPA, ROAS, and CPM from raw Google Ads metrics.
 */

export interface ComputedMetrics {
  cpa: number | null;
  roas: number | null;
  cpm: number | null;
}

export function computeMetrics(metrics: Record<string, unknown>): ComputedMetrics {
  const cost = Number(metrics.cost_micros || 0) / 1_000_000;
  const conversions = Number(metrics.conversions || 0);
  const conversionsValue = Number(metrics.conversions_value || 0);
  const impressions = Number(metrics.impressions || 0);

  return {
    cpa: conversions > 0 ? cost / conversions : null,
    roas: cost > 0 ? conversionsValue / cost : null,
    cpm: impressions > 0 ? (cost / impressions) * 1000 : null,
  };
}

export function addComputedMetrics(row: Record<string, any>): Record<string, any> {
  const metrics = row.metrics || {};
  return {
    ...row,
    computedMetrics: computeMetrics(metrics),
  };
}
