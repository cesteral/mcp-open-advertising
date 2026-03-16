import { describe, it, expect } from "vitest";
import { GetInsightsInputSchema } from "../../src/mcp-server/tools/definitions/get-insights.tool.js";

describe("GetInsightsInputSchema", () => {
  it("accepts valid insights input with preset dateRange", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid insights input with custom dates", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects both dateRange and custom dates", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects neither dateRange nor custom dates", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects startDate without endDate", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects endDate without startDate", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid startDate format", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "01-01-2026",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid endDate format", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "2026-01-01",
      endDate: "Jan 31",
    });
    expect(result.success).toBe(false);
  });

  it("defaults limit to 50", () => {
    const result = GetInsightsInputSchema.parse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
    });
    expect(result.limit).toBe(50);
  });

  it("requires numeric customerId", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "abc-def",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty customerId", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all 6 supported insights entity types", () => {
    const entityTypes = ["customer", "campaign", "adGroup", "adGroupAd", "adGroupCriterion", "campaignCriterion"];

    for (const entityType of entityTypes) {
      const result = GetInsightsInputSchema.safeParse({
        customerId: "1234567890",
        entityType,
        dateRange: "LAST_7_DAYS",
      });
      expect(result.success, `Failed for entityType: ${entityType}`).toBe(true);
    }
  });

  it("rejects entity types not supported for insights", () => {
    const unsupportedTypes = ["biddingStrategy", "conversionAction"];

    for (const entityType of unsupportedTypes) {
      const result = GetInsightsInputSchema.safeParse({
        customerId: "1234567890",
        entityType,
        dateRange: "LAST_7_DAYS",
      });
      expect(result.success, `Should reject entityType: ${entityType}`).toBe(false);
    }
  });

  it("accepts all supported date ranges", () => {
    const dateRanges = [
      "TODAY",
      "YESTERDAY",
      "LAST_7_DAYS",
      "LAST_30_DAYS",
      "THIS_MONTH",
      "LAST_MONTH",
      "LAST_90_DAYS",
    ];

    for (const dateRange of dateRanges) {
      const result = GetInsightsInputSchema.safeParse({
        customerId: "1234567890",
        entityType: "campaign",
        dateRange,
      });
      expect(result.success, `Failed for dateRange: ${dateRange}`).toBe(true);
    }
  });

  it("rejects unsupported date range", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_365_DAYS",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional entityId (numeric)", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      entityId: "9876543210",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric entityId", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      entityId: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional custom metrics list", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      metrics: ["clicks", "impressions", "metrics.cost_micros"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid metric names", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      metrics: ["invalid metric!"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional pageToken", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      pageToken: "next-page",
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit over 10000", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      limit: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit less than 1", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts includeComputedMetrics flag", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
      includeComputedMetrics: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults includeComputedMetrics to false", () => {
    const result = GetInsightsInputSchema.parse({
      customerId: "1234567890",
      entityType: "campaign",
      dateRange: "LAST_30_DAYS",
    });
    expect(result.includeComputedMetrics).toBe(false);
  });

  it("requires entityType", () => {
    const result = GetInsightsInputSchema.safeParse({
      customerId: "1234567890",
      dateRange: "LAST_30_DAYS",
    });
    expect(result.success).toBe(false);
  });
});
