// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * The basis a reporting response's numbers were computed on.
 *
 * `computeMetrics()` returns `{ cpa, roas, cpm, ctr, cpc }` and nothing else, and
 * each server normalizes platform field names and units before calling it — so by
 * the time a number reaches the client, the basis it was computed on has been
 * discarded. An agent calling two platforms in one turn gets two `cpa` values
 * that look directly comparable and are not: different attribution windows,
 * potentially different account currencies and timezones. Summing or averaging
 * them produces a confidently wrong number with nothing in either payload
 * signalling the mismatch.
 *
 * The only defense before this was one prose line duplicated across ten copies of
 * `cross-platform-campaign-setup.prompt.ts` ("cross-platform CPA comparisons are
 * directional"). MCP prompts are opt-in, so nothing makes a client read it before
 * calling a reporting tool — and it puts a correctness constraint in prose, which
 * is what the rest of the governance design deliberately refuses to do.
 *
 * Emitted once per response, NOT per row: `ComputedMetricRow` is
 * `Record<string, string>`, so a nested object cannot be a row value, and
 * repeating identical basis fields across 10k rows is pure bloat.
 */

/**
 * The computed metrics derived from conversion counts, and therefore the only
 * ones an attribution window governs.
 *
 * `cpm`, `ctr` and `cpc` come from impressions and clicks — they carry no
 * attribution window at all, and tagging them with one would be misinformation.
 * Kept beside `computeMetrics` in spirit: if a conversion-derived metric is ever
 * added there, it belongs here too.
 */
export const CONVERSION_DERIVED_METRICS = ["cpa", "roas"] as const;

export const MetricContextSchema = z.object({
  source: z.string().describe("Platform the metrics were read from, e.g. `google_ads`, `meta_ads`"),
  currency: z
    .string()
    .optional()
    .describe(
      "ISO currency the monetary metrics are denominated in. ABSENT means the server could not determine it — never assume a default."
    ),
  timezone: z
    .string()
    .optional()
    .describe(
      "IANA timezone the reporting day boundaries were drawn on. ABSENT means undetermined."
    ),
  dateRange: z
    .object({
      start: z.string().describe("Inclusive start, YYYY-MM-DD"),
      end: z.string().describe("Inclusive end, YYYY-MM-DD"),
    })
    .optional()
    .describe("Resolved reporting window. Absent when the request used an unresolved preset."),
  conversionBasis: z
    .object({
      attributionWindow: z
        .string()
        .describe("Platform-native window string, e.g. `7d_click,1d_view`"),
      appliesTo: z
        .array(z.string())
        .describe(
          "The metrics this window governs. Conversion-derived only — CPM/CTR/CPC are not attributed."
        ),
    })
    .optional()
    .describe(
      "Attribution basis for conversion-derived metrics. ABSENT means the window is not known to this server — commonly because the caller did not specify one and the platform applied an account default."
    ),
});

export type MetricContext = z.infer<typeof MetricContextSchema>;

/**
 * Assemble a {@link MetricContext}, omitting every field the caller could not
 * determine.
 *
 * Omission is deliberate and load-bearing. A guessed currency or a default
 * attribution window is worse than silence: it is indistinguishable from a known
 * one, so a client cannot tell "these agree" from "nobody checked". Absence lets
 * a client refuse to combine results whose basis it cannot establish, which is
 * the whole point of publishing this.
 *
 * Pass `undefined` for anything unknown rather than substituting a plausible
 * value.
 */
export function buildMetricContext(params: {
  source: string;
  currency?: string;
  timezone?: string;
  dateRange?: { start?: string; end?: string };
  /** Platform-native window, when the server actually knows it. */
  attributionWindow?: string;
}): MetricContext {
  const { source, currency, timezone, dateRange, attributionWindow } = params;

  // A half-known range is not a range. Emitting one end would read as a resolved
  // window that happens to be open-ended, which is a different claim.
  const resolvedRange =
    dateRange?.start && dateRange.end ? { start: dateRange.start, end: dateRange.end } : undefined;

  return {
    source,
    ...(currency ? { currency } : {}),
    ...(timezone ? { timezone } : {}),
    ...(resolvedRange ? { dateRange: resolvedRange } : {}),
    ...(attributionWindow
      ? {
          conversionBasis: {
            attributionWindow,
            appliesTo: [...CONVERSION_DERIVED_METRICS],
          },
        }
      : {}),
  };
}
