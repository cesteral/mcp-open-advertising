// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Generic computed metrics utility.
 *
 * Derives CPA, ROAS, CPM, CTR, CPC from normalized delivery inputs.
 * Each MCP server is responsible for normalizing platform-specific field names
 * and unit conversions (e.g. cost_micros → cost) before calling this function.
 */

export interface ComputedMetricsInput {
  /** Total spend in currency units (not micros) */
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Total conversion value (revenue) in currency units */
  conversionValue: number;
}

export interface ComputedMetrics {
  /** Cost per acquisition: cost / conversions */
  cpa: number | null;
  /** Return on ad spend: conversionValue / cost */
  roas: number | null;
  /** Cost per mille: (cost / impressions) * 1000 */
  cpm: number | null;
  /** Click-through rate: (clicks / impressions) * 100 */
  ctr: number | null;
  /** Cost per click: cost / clicks */
  cpc: number | null;
}

export function computeMetrics(input: ComputedMetricsInput): ComputedMetrics {
  const { cost, impressions, clicks, conversions, conversionValue } = input;
  return {
    cpa: conversions > 0 ? round2(cost / conversions) : null,
    roas: cost > 0 ? round4(conversionValue / cost) : null,
    cpm: impressions > 0 ? round2((cost / impressions) * 1000) : null,
    ctr: impressions > 0 ? round4((clicks / impressions) * 100) : null,
    cpc: clicks > 0 ? round2(cost / clicks) : null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
