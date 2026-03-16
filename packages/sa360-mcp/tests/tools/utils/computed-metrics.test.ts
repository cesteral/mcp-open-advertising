import { describe, it, expect } from "vitest";
import { computeMetrics, addComputedMetrics } from "../../../src/mcp-server/tools/utils/computed-metrics.js";

describe("computeMetrics", () => {
  it("calculates CPA correctly", () => {
    const result = computeMetrics({
      cost_micros: "10000000", // $10
      conversions: "5",
    });
    expect(result.cpa).toBe(2); // $10 / 5 = $2
  });

  it("calculates ROAS correctly", () => {
    const result = computeMetrics({
      cost_micros: "5000000", // $5
      conversions_value: "25",
    });
    expect(result.roas).toBe(5); // $25 / $5 = 5x
  });

  it("calculates CPM correctly", () => {
    const result = computeMetrics({
      cost_micros: "10000000", // $10
      impressions: "5000",
    });
    expect(result.cpm).toBe(2); // ($10 / 5000) * 1000 = $2
  });

  it("returns null CPA when conversions is zero", () => {
    const result = computeMetrics({
      cost_micros: "10000000",
      conversions: "0",
    });
    expect(result.cpa).toBeNull();
  });

  it("returns null ROAS when cost is zero", () => {
    const result = computeMetrics({
      cost_micros: "0",
      conversions_value: "100",
    });
    expect(result.roas).toBeNull();
  });

  it("returns null CPM when impressions is zero", () => {
    const result = computeMetrics({
      cost_micros: "10000000",
      impressions: "0",
    });
    expect(result.cpm).toBeNull();
  });

  it("handles missing metrics gracefully", () => {
    const result = computeMetrics({});
    expect(result.cpa).toBeNull();
    expect(result.roas).toBeNull();
    expect(result.cpm).toBeNull();
  });

  it("handles numeric values as numbers", () => {
    const result = computeMetrics({
      cost_micros: 20000000,
      conversions: 4,
      conversions_value: 100,
      impressions: 10000,
    });
    expect(result.cpa).toBe(5);
    expect(result.roas).toBe(5);
    expect(result.cpm).toBe(2);
  });
});

describe("addComputedMetrics", () => {
  it("adds computedMetrics to a row with metrics", () => {
    const row = {
      campaign: { id: "123", name: "Campaign A" },
      metrics: {
        cost_micros: "10000000",
        conversions: "2",
        conversions_value: "50",
        impressions: "1000",
      },
    };

    const result = addComputedMetrics(row);
    expect(result.computedMetrics).toBeDefined();
    expect(result.computedMetrics.cpa).toBe(5);
    expect(result.computedMetrics.roas).toBe(5);
    expect(result.computedMetrics.cpm).toBe(10);
  });

  it("preserves original row fields", () => {
    const row = {
      campaign: { id: "123" },
      metrics: { cost_micros: "0" },
    };

    const result = addComputedMetrics(row);
    expect(result.campaign).toEqual({ id: "123" });
    expect(result.metrics).toEqual({ cost_micros: "0" });
  });

  it("handles row with no metrics key", () => {
    const row = { campaign: { id: "123" } };
    const result = addComputedMetrics(row);
    expect(result.computedMetrics.cpa).toBeNull();
    expect(result.computedMetrics.roas).toBeNull();
    expect(result.computedMetrics.cpm).toBeNull();
  });
});
