// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { computeMetrics } from "@cesteral/shared";
import type { ComputedMetrics, ComputedMetricsInput } from "@cesteral/shared";

/**
 * Computed-metric inputs for Meta Insights rows.
 *
 * Meta returns `spend`, `impressions` and `clicks` as numeric strings, but
 * `actions` / `action_values` (and `conversions`, `conversion_values`,
 * `purchase_roas`) as `list<AdsActionStats>` — arrays of
 * `{ action_type, value }` objects (facebook-python-business-sdk v26.0,
 * `facebook_business/adobjects/adsinsights.py` field types). Conversion counts
 * and values therefore have to be summed out of those arrays; coercing the
 * array itself with `Number()`/`String()` yields NaN / "[object Object]".
 */

type ActionStat = { action_type?: string; value?: unknown };

/**
 * Action types counted as conversions. The `actions` array also carries
 * engagement/click actions that must not be counted.
 *
 * NOTE: Meta's `actions` array can report the same underlying event under more
 * than one action type (e.g. `purchase` and `offsite_conversion.fb_pixel_purchase`),
 * so this sum may over-count. Not changed here: the overlap is not documented in
 * any reachable primary source (the Business SDKs do not describe action-type
 * semantics).
 */
function isConversionAction(actionType: string): boolean {
  return (
    actionType.startsWith("offsite_conversion") ||
    actionType === "purchase" ||
    actionType === "complete_registration" ||
    actionType === "lead"
  );
}

function sumConversionActions(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  return (list as ActionStat[])
    .filter((a) => isConversionAction(a?.action_type ?? ""))
    .reduce((sum, a) => {
      const n = Number(a.value || 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
}

function toNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function metaComputedMetricInputs(row: Record<string, unknown>): ComputedMetricsInput {
  return {
    cost: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    conversions: sumConversionActions(row.actions),
    conversionValue: sumConversionActions(row.action_values),
  };
}

export function computeMetaRowMetrics(row: Record<string, unknown>): ComputedMetrics {
  return computeMetrics(metaComputedMetricInputs(row));
}

const REQUIRED_SOURCE_FIELDS: Array<[keyof ComputedMetricsInput, string]> = [
  ["cost", "spend"],
  ["impressions", "impressions"],
  ["clicks", "clicks"],
  ["conversions", "actions"],
  ["conversionValue", "action_values"],
];

/**
 * Append the fleet's flat computed-metric columns (`cpa`, `roas`, `cpm`, `ctr`,
 * `cpc`, as strings) to async-report rows WITHOUT altering the row's own
 * values — array fields such as `actions` are passed through untouched.
 * Missing source fields (detected on the first row) are listed in
 * `_computedMetricsWarnings`, mirroring the shared `appendComputedMetricsToRows`.
 */
export function appendMetaComputedMetricsToRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (rows.length === 0) return rows;
  const first = rows[0]!;
  const warnings = REQUIRED_SOURCE_FIELDS.filter(([, field]) => !(field in first)).map(
    ([key]) => `missing:${key}`
  );
  return rows.map((row) => {
    const m = computeMetaRowMetrics(row);
    const out: Record<string, unknown> = {
      ...row,
      cpa: m.cpa?.toString() ?? "",
      roas: m.roas?.toString() ?? "",
      cpm: m.cpm?.toString() ?? "",
      ctr: m.ctr?.toString() ?? "",
      cpc: m.cpc?.toString() ?? "",
    };
    if (warnings.length > 0) out._computedMetricsWarnings = warnings.join(",");
    return out;
  });
}
