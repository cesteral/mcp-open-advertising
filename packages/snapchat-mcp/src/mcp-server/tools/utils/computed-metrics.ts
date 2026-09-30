// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { computeMetrics } from "@cesteral/shared";

/**
 * Snapchat money amounts are micro-currency: 1,000,000 micros = 1.00 of the
 * ad account's currency. The package applies this to every monetary field it
 * handles — `bid_micro` (adjustBids divides/multiplies by it), the budget
 * fields, and the canonical snapshots (capture-snapshot.ts). Report `spend`
 * and `conversion_purchases_value` follow the same convention.
 */
export const SNAPCHAT_MICROS_PER_CURRENCY_UNIT = 1_000_000;

/** Parse a report cell holding a micro-currency amount into account currency. */
export function microsToCurrency(raw: string | undefined): number {
  const micros = Number(raw || 0);
  return Number.isFinite(micros) ? micros / SNAPCHAT_MICROS_PER_CURRENCY_UNIT : 0;
}

/**
 * Append computed CPA / ROAS / CPM / CTR / CPC columns to Snapchat report rows.
 *
 * `spend` and `conversion_purchases_value` are converted from micro-currency
 * before computing, so the derived cost metrics are in account currency (they
 * used to be computed on raw micros and came out 1,000,000× too large).
 * `swipes` is Snapchat's click. ROAS is left blank when the report carries no
 * `conversion_purchases_value` column, rather than reported as 0.
 */
export function appendSnapchatComputedMetrics(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const spendIdx = idx("spend");
  const impIdx = idx("impressions");
  const clickIdx = idx("swipes"); // Snapchat calls clicks "swipes"
  const convIdx = idx("conversion_purchases");
  const valueIdx = idx("conversion_purchases_value");

  const newHeaders = [
    ...headers,
    "computed_cpa",
    "computed_roas",
    "computed_cpm",
    "computed_ctr",
    "computed_cpc",
  ];
  const newRows = rows.map((row) => {
    const cost = spendIdx >= 0 ? microsToCurrency(row[spendIdx]) : 0;
    const impressions = impIdx >= 0 ? Number(row[impIdx] || 0) : 0;
    const clicks = clickIdx >= 0 ? Number(row[clickIdx] || 0) : 0;
    const conversions = convIdx >= 0 ? Number(row[convIdx] || 0) : 0;
    const conversionValue = valueIdx >= 0 ? microsToCurrency(row[valueIdx]) : 0;
    const m = computeMetrics({ cost, impressions, clicks, conversions, conversionValue });
    const roas = valueIdx >= 0 ? m.roas : null;
    return [
      ...row,
      m.cpa !== null ? String(m.cpa) : "",
      roas !== null ? String(roas) : "",
      m.cpm !== null ? String(m.cpm) : "",
      m.ctr !== null ? String(m.ctr) : "",
      m.cpc !== null ? String(m.cpc) : "",
    ];
  });
  return { headers: newHeaders, rows: newRows };
}
