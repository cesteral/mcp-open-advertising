// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import {
  ComputedMetricsFlagSchema,
  appendComputedMetricsToRows,
} from "../../src/utils/computed-metrics.js";

describe("ComputedMetricsFlagSchema", () => {
  it("defaults includeComputedMetrics to false", () => {
    const parsed = ComputedMetricsFlagSchema.parse({});
    expect(parsed.includeComputedMetrics).toBe(false);
  });

  it("accepts explicit true", () => {
    const parsed = ComputedMetricsFlagSchema.parse({ includeComputedMetrics: true });
    expect(parsed.includeComputedMetrics).toBe(true);
  });
});

describe("appendComputedMetricsToRows", () => {
  it("appends CPA/ROAS/CPM/CTR/CPC columns per row", () => {
    const rows = [
      {
        cost: "100",
        impressions: "10000",
        clicks: "200",
        conversions: "4",
        conversionValue: "400",
      },
    ];
    const out = appendComputedMetricsToRows(rows);
    expect(out[0]).toMatchObject({
      cpa: "25",
      roas: "4",
      cpm: "10",
      ctr: "2",
      cpc: "0.5",
    });
  });

  it("emits warning when required input missing", () => {
    const rows = [{ cost: "100", impressions: "1000" }];
    const out = appendComputedMetricsToRows(rows);
    expect(out[0]!.cpa).toBe("");
    expect(out[0]!._computedMetricsWarnings).toContain("missing:clicks");
  });

  it("is a no-op on empty input", () => {
    expect(appendComputedMetricsToRows([])).toEqual([]);
  });

  it("resolves column aliases", () => {
    const rows = [
      { spend: "50", imps: "5000", clicks: "100", conversions: "2", revenue: "100" },
    ];
    const out = appendComputedMetricsToRows(rows, {
      cost: ["spend"],
      impressions: ["imps"],
      conversionValue: ["revenue"],
    });
    expect(out[0]!._computedMetricsWarnings).toBeUndefined();
    expect(out[0]!.cpa).toBe("25");
  });
});
