import { describe, it, expect } from "vitest";
import { GetInsightsBreakdownsInputSchema } from "../../src/mcp-server/tools/definitions/get-insights-breakdowns.tool.js";

describe("GetInsightsBreakdownsInputSchema", () => {
  const validInput = {
    customerId: "1234567890",
    entityType: "campaign",
    dateRange: "LAST_30_DAYS",
    breakdowns: ["segments.device"],
  };

  it("accepts valid input with dateRange", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with custom dates", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      breakdowns: ["segments.date"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects both dateRange and custom dates", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      ...validInput,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejects neither dateRange nor custom dates", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      breakdowns: ["segments.device"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects startDate without endDate", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      customerId: "1234567890",
      entityType: "campaign",
      startDate: "2026-01-01",
      breakdowns: ["segments.device"],
    });
    expect(result.success).toBe(false);
  });

  it("defaults mode to summary and leaves limit/maxRows unset", () => {
    const result = GetInsightsBreakdownsInputSchema.parse(validInput);
    expect(result.mode).toBe("summary");
    expect(result.limit).toBeUndefined();
    expect(result.maxRows).toBeUndefined();
  });

  it("requires at least one breakdown", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      ...validInput,
      breakdowns: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all 6 insights entity types", () => {
    const types = [
      "customer",
      "campaign",
      "adGroup",
      "adGroupAd",
      "adGroupCriterion",
      "campaignCriterion",
    ];
    for (const entityType of types) {
      const result = GetInsightsBreakdownsInputSchema.safeParse({ ...validInput, entityType });
      expect(result.success, `Failed for entityType: ${entityType}`).toBe(true);
    }
  });

  it("rejects entity types not supported for insights", () => {
    const unsupportedTypes = ["biddingStrategy", "conversionAction"];
    for (const entityType of unsupportedTypes) {
      const result = GetInsightsBreakdownsInputSchema.safeParse({ ...validInput, entityType });
      expect(result.success, `Should reject entityType: ${entityType}`).toBe(false);
    }
  });

  it("accepts includeComputedMetrics flag", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      ...validInput,
      includeComputedMetrics: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults includeComputedMetrics to false", () => {
    const result = GetInsightsBreakdownsInputSchema.parse(validInput);
    expect(result.includeComputedMetrics).toBe(false);
  });

  it("rejects invalid segment name", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      ...validInput,
      breakdowns: ["invalid segment!"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts segment names with or without prefix", () => {
    const result = GetInsightsBreakdownsInputSchema.safeParse({
      ...validInput,
      breakdowns: ["date", "segments.device"],
    });
    expect(result.success).toBe(true);
  });
});
