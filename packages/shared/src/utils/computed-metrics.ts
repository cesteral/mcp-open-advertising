// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

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

/**
 * Zod schema fragment for the `includeComputedMetrics` flag.
 *
 * Merge into a tool input schema via `.merge(ComputedMetricsFlagSchema)` so every
 * reporting download tool inherits the same opt-in flag (default: `false`).
 */
export const ComputedMetricsFlagSchema = z.object({
  includeComputedMetrics: z.boolean().default(false),
});

export type ComputedMetricRow = Record<string, string>;

const REQUIRED_INPUT_KEYS = [
  "cost",
  "impressions",
  "clicks",
  "conversions",
  "conversionValue",
] as const;

type RequiredInputKey = (typeof REQUIRED_INPUT_KEYS)[number];

/** Optional per-key alias map for platforms that name columns differently. */
export type ColumnAliases = Partial<Record<RequiredInputKey, string[]>>;

/**
 * Append CPA, ROAS, CPM, CTR, CPC columns to each row based on detected input columns.
 *
 * - Opt-in at the tool layer via {@link ComputedMetricsFlagSchema}.
 * - Input columns are detected on the first row by checking the canonical key
 *   first, then each alias supplied in `aliases`.
 * - Missing required columns produce empty computed values and a comma-separated
 *   `_computedMetricsWarnings` column listing the missing canonical keys.
 * - A no-op on an empty input array.
 */
export function appendComputedMetricsToRows(
  rows: ComputedMetricRow[],
  aliases: ColumnAliases = {},
): ComputedMetricRow[] {
  if (rows.length === 0) return rows;
  const firstRow = rows[0]!;
  const findCol = (key: RequiredInputKey): string | null => {
    if (key in firstRow) return key;
    for (const alias of aliases[key] ?? []) {
      if (alias in firstRow) return alias;
    }
    return null;
  };
  const cols = Object.fromEntries(
    REQUIRED_INPUT_KEYS.map((k) => [k, findCol(k)]),
  ) as Record<RequiredInputKey, string | null>;
  const warnings = REQUIRED_INPUT_KEYS.filter((k) => !cols[k]).map(
    (k) => `missing:${k}`,
  );
  return rows.map((row) => {
    const num = (k: RequiredInputKey): number => {
      const col = cols[k];
      if (!col) return 0;
      const value = Number(row[col]);
      return Number.isFinite(value) ? value : 0;
    };
    const m = computeMetrics({
      cost: num("cost"),
      impressions: num("impressions"),
      clicks: num("clicks"),
      conversions: num("conversions"),
      conversionValue: num("conversionValue"),
    });
    const out: ComputedMetricRow = { ...row };
    out.cpa = m.cpa?.toString() ?? "";
    out.roas = m.roas?.toString() ?? "";
    out.cpm = m.cpm?.toString() ?? "";
    out.ctr = m.ctr?.toString() ?? "";
    out.cpc = m.cpc?.toString() ?? "";
    if (warnings.length > 0) out._computedMetricsWarnings = warnings.join(",");
    return out;
  });
}
