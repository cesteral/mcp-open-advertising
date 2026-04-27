import { describe, it, expect } from "vitest";
import {
  PERFORMANCE_METRICS,
  calculateMetric,
  calculateAllMetrics,
  calculateMetricByName,
  calculateCPM,
  calculateCTR,
  calculateCPC,
  calculateCPA,
  calculateROAS,
  formatMetricValue,
  getMetricDescription,
} from "../../src/utils/metrics.js";
import type { DeliveryMetrics } from "../../src/services/bid-manager/types.js";

// =============================================================================
// Test fixtures
// =============================================================================

function makeDelivery(overrides: Partial<DeliveryMetrics> = {}): DeliveryMetrics {
  return {
    impressions: 100_000,
    clicks: 500,
    spend: 250,
    conversions: 25,
    revenue: 1000,
    ...overrides,
  };
}

const ZERO_DELIVERY: DeliveryMetrics = {
  impressions: 0,
  clicks: 0,
  spend: 0,
  conversions: 0,
  revenue: 0,
};

// =============================================================================
// PERFORMANCE_METRICS configuration
// =============================================================================

describe("PERFORMANCE_METRICS configuration", () => {
  it("has all five metric keys", () => {
    expect(Object.keys(PERFORMANCE_METRICS)).toEqual(
      expect.arrayContaining(["cpm", "ctr", "cpc", "cpa", "roas"])
    );
    expect(Object.keys(PERFORMANCE_METRICS)).toHaveLength(5);
  });

  it("CPM config is spend/impressions * 1000", () => {
    const cfg = PERFORMANCE_METRICS.cpm;
    expect(cfg.numerator).toBe("spend");
    expect(cfg.denominator).toBe("impressions");
    expect(cfg.multiplier).toBe(1000);
    expect(cfg.unit).toBe("$");
  });

  it("CTR config is clicks/impressions * 100", () => {
    const cfg = PERFORMANCE_METRICS.ctr;
    expect(cfg.numerator).toBe("clicks");
    expect(cfg.denominator).toBe("impressions");
    expect(cfg.multiplier).toBe(100);
    expect(cfg.unit).toBe("%");
  });

  it("CPC config is spend/clicks * 1", () => {
    const cfg = PERFORMANCE_METRICS.cpc;
    expect(cfg.numerator).toBe("spend");
    expect(cfg.denominator).toBe("clicks");
    expect(cfg.multiplier).toBe(1);
    expect(cfg.unit).toBe("$");
  });

  it("CPA config is spend/conversions * 1", () => {
    const cfg = PERFORMANCE_METRICS.cpa;
    expect(cfg.numerator).toBe("spend");
    expect(cfg.denominator).toBe("conversions");
    expect(cfg.multiplier).toBe(1);
    expect(cfg.unit).toBe("$");
  });

  it("ROAS config is revenue/spend * 1", () => {
    const cfg = PERFORMANCE_METRICS.roas;
    expect(cfg.numerator).toBe("revenue");
    expect(cfg.denominator).toBe("spend");
    expect(cfg.multiplier).toBe(1);
    expect(cfg.unit).toBe("x");
  });
});

// =============================================================================
// calculateMetric
// =============================================================================

describe("calculateMetric", () => {
  it("calculates CPM correctly", () => {
    const delivery = makeDelivery(); // spend=250, impressions=100000
    const result = calculateMetric(delivery, PERFORMANCE_METRICS.cpm);
    // 250 / 100000 * 1000 = 2.5
    expect(result).toBe(2.5);
  });

  it("calculates CTR correctly", () => {
    const delivery = makeDelivery(); // clicks=500, impressions=100000
    const result = calculateMetric(delivery, PERFORMANCE_METRICS.ctr);
    // 500 / 100000 * 100 = 0.5
    expect(result).toBe(0.5);
  });

  it("calculates CPC correctly", () => {
    const delivery = makeDelivery(); // spend=250, clicks=500
    const result = calculateMetric(delivery, PERFORMANCE_METRICS.cpc);
    // 250 / 500 = 0.5
    expect(result).toBe(0.5);
  });

  it("calculates CPA correctly", () => {
    const delivery = makeDelivery(); // spend=250, conversions=25
    const result = calculateMetric(delivery, PERFORMANCE_METRICS.cpa);
    // 250 / 25 = 10
    expect(result).toBe(10);
  });

  it("calculates ROAS correctly", () => {
    const delivery = makeDelivery(); // revenue=1000, spend=250
    const result = calculateMetric(delivery, PERFORMANCE_METRICS.roas);
    // 1000 / 250 = 4
    expect(result).toBe(4);
  });

  it("returns 0 when denominator is zero", () => {
    const delivery = makeDelivery({ impressions: 0 });
    const cpm = calculateMetric(delivery, PERFORMANCE_METRICS.cpm);
    expect(cpm).toBe(0);

    const ctr = calculateMetric(delivery, PERFORMANCE_METRICS.ctr);
    expect(ctr).toBe(0);
  });

  it("returns 0 when all metrics are zero", () => {
    expect(calculateMetric(ZERO_DELIVERY, PERFORMANCE_METRICS.cpm)).toBe(0);
    expect(calculateMetric(ZERO_DELIVERY, PERFORMANCE_METRICS.ctr)).toBe(0);
    expect(calculateMetric(ZERO_DELIVERY, PERFORMANCE_METRICS.cpc)).toBe(0);
    expect(calculateMetric(ZERO_DELIVERY, PERFORMANCE_METRICS.cpa)).toBe(0);
    expect(calculateMetric(ZERO_DELIVERY, PERFORMANCE_METRICS.roas)).toBe(0);
  });
});

// =============================================================================
// calculateAllMetrics
// =============================================================================

describe("calculateAllMetrics", () => {
  it("returns all delivery and derived metrics", () => {
    const delivery = makeDelivery();
    const result = calculateAllMetrics(delivery);

    // Base delivery metrics are passed through
    expect(result.impressions).toBe(100_000);
    expect(result.clicks).toBe(500);
    expect(result.spend).toBe(250);
    expect(result.conversions).toBe(25);
    expect(result.revenue).toBe(1000);

    // Derived metrics
    expect(result.cpm).toBe(2.5); // 250/100000*1000
    expect(result.ctr).toBe(0.5); // 500/100000*100
    expect(result.cpc).toBe(0.5); // 250/500
    expect(result.cpa).toBe(10); // 250/25
    expect(result.roas).toBe(4); // 1000/250
  });

  it("handles zero delivery gracefully", () => {
    const result = calculateAllMetrics(ZERO_DELIVERY);

    expect(result.impressions).toBe(0);
    expect(result.clicks).toBe(0);
    expect(result.spend).toBe(0);
    expect(result.conversions).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.cpm).toBe(0);
    expect(result.ctr).toBe(0);
    expect(result.cpc).toBe(0);
    expect(result.cpa).toBe(0);
    expect(result.roas).toBe(0);
  });

  it("handles partial data (no clicks, no conversions)", () => {
    const delivery = makeDelivery({ clicks: 0, conversions: 0 });
    const result = calculateAllMetrics(delivery);

    // CPM should still work (impressions > 0)
    expect(result.cpm).toBe(2.5);
    // CTR 0 because clicks = 0
    expect(result.ctr).toBe(0);
    // CPC 0 because clicks = 0 (division by zero)
    expect(result.cpc).toBe(0);
    // CPA 0 because conversions = 0
    expect(result.cpa).toBe(0);
    // ROAS still works (spend > 0)
    expect(result.roas).toBe(4);
  });
});

// =============================================================================
// calculateMetricByName
// =============================================================================

describe("calculateMetricByName", () => {
  it("calculates metric by string name", () => {
    const delivery = makeDelivery();

    expect(calculateMetricByName(delivery, "cpm")).toBe(2.5);
    expect(calculateMetricByName(delivery, "ctr")).toBe(0.5);
    expect(calculateMetricByName(delivery, "cpc")).toBe(0.5);
    expect(calculateMetricByName(delivery, "cpa")).toBe(10);
    expect(calculateMetricByName(delivery, "roas")).toBe(4);
  });
});

// =============================================================================
// Convenience functions
// =============================================================================

describe("convenience functions", () => {
  describe("calculateCPM", () => {
    it("calculates CPM from spend and impressions", () => {
      expect(calculateCPM(50, 10_000)).toBe(5);
      expect(calculateCPM(250, 100_000)).toBe(2.5);
    });

    it("returns 0 for zero impressions", () => {
      expect(calculateCPM(50, 0)).toBe(0);
    });

    it("returns 0 for zero spend", () => {
      expect(calculateCPM(0, 10_000)).toBe(0);
    });
  });

  describe("calculateCTR", () => {
    it("calculates CTR from clicks and impressions", () => {
      expect(calculateCTR(500, 100_000)).toBe(0.5);
      expect(calculateCTR(100, 1_000)).toBe(10);
    });

    it("returns 0 for zero impressions", () => {
      expect(calculateCTR(500, 0)).toBe(0);
    });

    it("returns 0 for zero clicks", () => {
      expect(calculateCTR(0, 100_000)).toBe(0);
    });
  });

  describe("calculateCPC", () => {
    it("calculates CPC from spend and clicks", () => {
      expect(calculateCPC(250, 500)).toBe(0.5);
      expect(calculateCPC(100, 50)).toBe(2);
    });

    it("returns 0 for zero clicks", () => {
      expect(calculateCPC(250, 0)).toBe(0);
    });

    it("returns 0 for zero spend", () => {
      expect(calculateCPC(0, 500)).toBe(0);
    });
  });

  describe("calculateCPA", () => {
    it("calculates CPA from spend and conversions", () => {
      expect(calculateCPA(250, 25)).toBe(10);
      expect(calculateCPA(1000, 100)).toBe(10);
    });

    it("returns 0 for zero conversions", () => {
      expect(calculateCPA(250, 0)).toBe(0);
    });

    it("returns 0 for zero spend", () => {
      expect(calculateCPA(0, 25)).toBe(0);
    });
  });

  describe("calculateROAS", () => {
    it("calculates ROAS from revenue and spend", () => {
      expect(calculateROAS(1000, 250)).toBe(4);
      expect(calculateROAS(500, 500)).toBe(1);
    });

    it("returns 0 for zero spend", () => {
      expect(calculateROAS(1000, 0)).toBe(0);
    });

    it("returns 0 for zero revenue", () => {
      expect(calculateROAS(0, 250)).toBe(0);
    });
  });
});

// =============================================================================
// formatMetricValue
// =============================================================================

describe("formatMetricValue", () => {
  it("formats CPM with dollar sign", () => {
    expect(formatMetricValue("cpm", 5.123)).toBe("$5.12");
  });

  it("formats CTR with percent sign", () => {
    expect(formatMetricValue("ctr", 2.567)).toBe("2.57%");
  });

  it("formats CPC with dollar sign", () => {
    expect(formatMetricValue("cpc", 1.5)).toBe("$1.50");
  });

  it("formats CPA with dollar sign", () => {
    expect(formatMetricValue("cpa", 10)).toBe("$10.00");
  });

  it("formats ROAS with x suffix", () => {
    expect(formatMetricValue("roas", 4.2)).toBe("4.20x");
  });

  it("respects custom decimal places", () => {
    expect(formatMetricValue("cpm", 5.12345, 4)).toBe("$5.1235");
    expect(formatMetricValue("ctr", 2.5, 0)).toBe("3%"); // rounds 2.5 to 3
  });

  it("handles zero values", () => {
    expect(formatMetricValue("cpm", 0)).toBe("$0.00");
    expect(formatMetricValue("ctr", 0)).toBe("0.00%");
    expect(formatMetricValue("roas", 0)).toBe("0.00x");
  });
});

// =============================================================================
// getMetricDescription
// =============================================================================

describe("getMetricDescription", () => {
  it("returns description for each metric", () => {
    expect(getMetricDescription("cpm")).toBe("Cost per thousand impressions");
    expect(getMetricDescription("ctr")).toBe("Click-through rate");
    expect(getMetricDescription("cpc")).toBe("Cost per click");
    expect(getMetricDescription("cpa")).toBe("Cost per acquisition/conversion");
    expect(getMetricDescription("roas")).toBe("Return on ad spend");
  });
});
