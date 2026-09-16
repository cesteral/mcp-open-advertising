// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `buildMetricContext` exists to make one property hold: a field is present only
 * when the server actually determined it. A guessed currency or a defaulted
 * attribution window is indistinguishable from a known one, so it would let a
 * client believe two platforms agree when nobody checked. These tests pin the
 * omission behaviour, because that is the part a well-meaning "fill in a sensible
 * default" change would quietly break.
 */

import { describe, it, expect } from "vitest";
import {
  buildMetricContext,
  MetricContextSchema,
  CONVERSION_DERIVED_METRICS,
} from "../../src/utils/metric-context.js";
import { createReportView } from "../../src/utils/report-view.js";
import { computeMetrics } from "../../src/utils/computed-metrics.js";

describe("buildMetricContext", () => {
  it("emits only source when nothing else is known", () => {
    const ctx = buildMetricContext({ source: "pinterest" });

    expect(ctx).toEqual({ source: "pinterest" });
    expect(Object.keys(ctx)).toEqual(["source"]);
  });

  it("omits unknown fields rather than emitting undefined", () => {
    // An explicit `undefined` serializes away in JSON but survives in-process,
    // where `"currency" in ctx` would read as "known".
    const ctx = buildMetricContext({
      source: "meta_ads",
      currency: undefined,
      timezone: undefined,
      attributionWindow: undefined,
    });

    expect("currency" in ctx).toBe(false);
    expect("timezone" in ctx).toBe(false);
    expect("conversionBasis" in ctx).toBe(false);
  });

  it("carries the fields it is given", () => {
    const ctx = buildMetricContext({
      source: "google_ads",
      currency: "SEK",
      timezone: "Europe/Stockholm",
      dateRange: { start: "2026-08-01", end: "2026-08-31" },
    });

    expect(ctx).toEqual({
      source: "google_ads",
      currency: "SEK",
      timezone: "Europe/Stockholm",
      dateRange: { start: "2026-08-01", end: "2026-08-31" },
    });
  });

  it("drops a half-known date range", () => {
    // One end alone would read as a resolved but open-ended window, which is a
    // different claim from "the window was never resolved".
    expect(
      "dateRange" in buildMetricContext({ source: "ttd", dateRange: { start: "2026-08-01" } })
    ).toBe(false);
    expect(
      "dateRange" in buildMetricContext({ source: "ttd", dateRange: { end: "2026-08-31" } })
    ).toBe(false);
    expect("dateRange" in buildMetricContext({ source: "ttd", dateRange: {} })).toBe(false);
  });

  it("binds an attribution window to conversion-derived metrics only", () => {
    const ctx = buildMetricContext({
      source: "meta_ads",
      attributionWindow: "7d_click,1d_view",
    });

    expect(ctx.conversionBasis).toEqual({
      attributionWindow: "7d_click,1d_view",
      appliesTo: ["cpa", "roas"],
    });
  });

  it("never attributes CPM, CTR or CPC", () => {
    // These come from impressions and clicks and carry no window at all, so
    // tagging them would be misinformation rather than missing information.
    const { appliesTo } = buildMetricContext({
      source: "meta_ads",
      attributionWindow: "1d_click",
    }).conversionBasis!;

    for (const metric of ["cpm", "ctr", "cpc"]) {
      expect(appliesTo).not.toContain(metric);
    }
  });

  it("appliesTo matches the conversion-derived metrics computeMetrics returns", () => {
    // Guards the pairing: if a conversion-derived metric is added to
    // computeMetrics without being listed here, its attribution silently
    // disappears. Non-conversion metrics must stay out.
    const metrics = computeMetrics({
      cost: 100,
      impressions: 1000,
      clicks: 50,
      conversions: 10,
      conversionValue: 400,
    });

    for (const name of CONVERSION_DERIVED_METRICS) {
      expect(metrics).toHaveProperty(name);
    }
    expect([...CONVERSION_DERIVED_METRICS]).toEqual(["cpa", "roas"]);
  });

  it("produces a value its own schema accepts", () => {
    const full = buildMetricContext({
      source: "amazon_dsp",
      currency: "USD",
      timezone: "America/Los_Angeles",
      dateRange: { start: "2026-08-01", end: "2026-08-31" },
      attributionWindow: "14d",
    });

    expect(() => MetricContextSchema.parse(full)).not.toThrow();
    expect(() => MetricContextSchema.parse(buildMetricContext({ source: "x" }))).not.toThrow();
  });
});

describe("createReportView + metricContext", () => {
  const rows = [{ date: "2026-08-01", impressions: "100" }];

  it("emits no metricContext key when a server has not adopted it", () => {
    const view = createReportView({ rows });

    expect("metricContext" in view).toBe(false);
  });

  it("passes the context through at response level, not per row", () => {
    const metricContext = buildMetricContext({
      source: "google_ads",
      dateRange: { start: "2026-08-01", end: "2026-08-31" },
    });

    const view = createReportView({ rows, input: { mode: "rows" }, metricContext });

    expect(view.metricContext).toEqual(metricContext);
    // Rows stay flat string records — the reason this is not per-row.
    for (const row of view.rows ?? []) {
      expect("metricContext" in row).toBe(false);
    }
  });

  it("survives aggregation and pagination unchanged", () => {
    const metricContext = buildMetricContext({ source: "ttd", attributionWindow: "7d_click" });
    const many = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
      impressions: String(i),
    }));

    const view = createReportView({
      rows: many,
      input: { mode: "rows", maxRows: 5, offset: 10 },
      metricContext,
    });

    expect(view.truncated).toBe(true);
    expect(view.metricContext).toEqual(metricContext);
  });
});
