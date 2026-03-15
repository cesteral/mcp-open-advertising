import { describe, it, expect } from "vitest";
import { SubmitReportInputSchema } from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

describe("SubmitReportInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Campaign Performance Report",
      type: "STANDARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing profileId", () => {
    const result = SubmitReportInputSchema.safeParse({
      name: "Test Report",
      type: "STANDARD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "",
      name: "Test Report",
      type: "STANDARD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      type: "STANDARD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing type", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid report types", () => {
    const types = [
      "STANDARD",
      "REACH",
      "PATH_TO_CONVERSION",
      "CROSS_DIMENSION_REACH",
      "FLOODLIGHT",
    ];

    for (const type of types) {
      const result = SubmitReportInputSchema.safeParse({
        profileId: "123456",
        name: "Test Report",
        type,
      });
      expect(result.success, `Expected type ${type} to be valid`).toBe(true);
    }
  });

  it("rejects invalid report type", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
      type: "INVALID_TYPE",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional criteria", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
      type: "STANDARD",
      criteria: {
        dateRange: { relativeDateRange: "LAST_30_DAYS" },
        dimensions: [{ name: "campaign" }],
        metricNames: ["impressions", "clicks"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.criteria).toBeDefined();
      expect(result.data.criteria!.dateRange).toEqual({
        relativeDateRange: "LAST_30_DAYS",
      });
    }
  });

  it("accepts optional additionalConfig", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Test Report",
      type: "STANDARD",
      additionalConfig: {
        format: "CSV",
        schedule: { active: false },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.additionalConfig).toBeDefined();
    }
  });

  it("accepts full input with all optional fields", () => {
    const result = SubmitReportInputSchema.safeParse({
      profileId: "123456",
      name: "Full Report",
      type: "REACH",
      criteria: {
        dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
        dimensions: [{ name: "campaign" }, { name: "advertiser" }],
        metricNames: ["impressions", "clicks", "mediaCost"],
      },
      additionalConfig: {
        format: "CSV",
      },
    });
    expect(result.success).toBe(true);
  });

  it("preserves criteria in parsed output", () => {
    const criteria = {
      dateRange: { relativeDateRange: "LAST_7_DAYS" },
      metricNames: ["impressions"],
    };
    const result = SubmitReportInputSchema.parse({
      profileId: "123456",
      name: "Test",
      type: "STANDARD",
      criteria,
    });
    expect(result.criteria).toEqual(criteria);
  });
});
