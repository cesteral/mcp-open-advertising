import { describe, it, expect } from "vitest";
import { SubmitReportInputSchema } from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

describe("SubmitReportInputSchema", () => {
  const validInput = {
    agencyId: "12345",
    reportType: "campaign",
    columns: [{ columnName: "impressions" }, { columnName: "clicks" }],
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  };

  it("accepts valid submit report input", () => {
    const result = SubmitReportInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("requires agencyId", () => {
    const { agencyId: _, ...rest } = validInput;
    const result = SubmitReportInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty agencyId", () => {
    const result = SubmitReportInputSchema.safeParse({ ...validInput, agencyId: "" });
    expect(result.success).toBe(false);
  });

  it("accepts optional advertiserId", () => {
    const result = SubmitReportInputSchema.safeParse({ ...validInput, advertiserId: "67890" });
    expect(result.success).toBe(true);
  });

  it("accepts all supported report types", () => {
    const types = [
      "campaign", "adGroup", "keyword", "ad", "advertiser",
      "productGroup", "floodlightActivity", "productLeadAndCrossSell",
    ];
    for (const reportType of types) {
      const result = SubmitReportInputSchema.safeParse({ ...validInput, reportType });
      expect(result.success, `Failed for reportType: ${reportType}`).toBe(true);
    }
  });

  it("rejects invalid report type", () => {
    const result = SubmitReportInputSchema.safeParse({ ...validInput, reportType: "invalid" });
    expect(result.success).toBe(false);
  });

  it("requires at least one column", () => {
    const result = SubmitReportInputSchema.safeParse({ ...validInput, columns: [] });
    expect(result.success).toBe(false);
  });

  it("requires column to have columnName", () => {
    const result = SubmitReportInputSchema.safeParse({
      ...validInput,
      columns: [{ headerText: "Clicks" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts column with headerText", () => {
    const result = SubmitReportInputSchema.safeParse({
      ...validInput,
      columns: [{ columnName: "clicks", headerText: "Total Clicks" }],
    });
    expect(result.success).toBe(true);
  });

  it("requires startDate in YYYY-MM-DD format", () => {
    const result = SubmitReportInputSchema.safeParse({ ...validInput, startDate: "01-01-2026" });
    expect(result.success).toBe(false);
  });

  it("requires endDate in YYYY-MM-DD format", () => {
    const result = SubmitReportInputSchema.safeParse({ ...validInput, endDate: "Jan 31, 2026" });
    expect(result.success).toBe(false);
  });

  it("accepts optional filters", () => {
    const result = SubmitReportInputSchema.safeParse({
      ...validInput,
      filters: [
        { column: { columnName: "status" }, operator: "equals", values: ["ACTIVE"] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional includeRemovedEntities", () => {
    const result = SubmitReportInputSchema.safeParse({
      ...validInput,
      includeRemovedEntities: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional statisticsCurrency", () => {
    const result = SubmitReportInputSchema.safeParse({
      ...validInput,
      statisticsCurrency: "USD",
    });
    expect(result.success).toBe(true);
  });
});
