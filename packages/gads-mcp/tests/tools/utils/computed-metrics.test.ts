// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { computeMetrics, addComputedMetrics } from "../../../src/mcp-server/tools/utils/computed-metrics.js";

describe("computeMetrics", () => {
  it("computes CPA correctly", () => {
    const result = computeMetrics({
      cost_micros: "5000000",
      conversions: "10",
      conversions_value: "0",
      impressions: "0",
    });
    expect(result.cpa).toBe(0.5);
  });

  it("computes ROAS correctly", () => {
    const result = computeMetrics({
      cost_micros: "5000000",
      conversions: "0",
      conversions_value: "100",
      impressions: "0",
    });
    expect(result.roas).toBe(20);
  });

  it("computes CPM correctly", () => {
    const result = computeMetrics({
      cost_micros: "5000000",
      conversions: "0",
      conversions_value: "0",
      impressions: "1000",
    });
    expect(result.cpm).toBe(5);
  });

  it("returns null CPA when conversions = 0", () => {
    const result = computeMetrics({
      cost_micros: "5000000",
      conversions: "0",
    });
    expect(result.cpa).toBeNull();
  });

  it("returns null ROAS when cost = 0", () => {
    const result = computeMetrics({
      cost_micros: "0",
      conversions_value: "100",
    });
    expect(result.roas).toBeNull();
  });

  it("returns null CPM when impressions = 0", () => {
    const result = computeMetrics({
      cost_micros: "5000000",
      impressions: "0",
    });
    expect(result.cpm).toBeNull();
  });

  it("handles missing metrics gracefully (treats as 0)", () => {
    const result = computeMetrics({});
    expect(result.cpa).toBeNull();
    expect(result.roas).toBeNull();
    expect(result.cpm).toBeNull();
  });

  it("handles numeric values (not strings)", () => {
    const result = computeMetrics({
      cost_micros: 2000000,
      conversions: 5,
      conversions_value: 50,
      impressions: 500,
    });
    expect(result.cpa).toBe(0.4);
    expect(result.roas).toBe(25);
    expect(result.cpm).toBe(4);
  });
});

describe("addComputedMetrics", () => {
  it("appends computedMetrics to the row", () => {
    const row = {
      campaign: { id: "1" },
      metrics: {
        cost_micros: "10000000",
        conversions: "20",
        conversions_value: "200",
        impressions: "2000",
      },
    };
    const result = addComputedMetrics(row);
    expect(result.campaign).toEqual({ id: "1" });
    expect(result.metrics).toEqual(row.metrics);
    expect(result.computedMetrics).toBeDefined();
    expect(result.computedMetrics.cpa).toBe(0.5);
  });

  it("handles row with no metrics field", () => {
    const row = { campaign: { id: "1" } };
    const result = addComputedMetrics(row);
    expect(result.computedMetrics.cpa).toBeNull();
    expect(result.computedMetrics.roas).toBeNull();
    expect(result.computedMetrics.cpm).toBeNull();
  });
});
