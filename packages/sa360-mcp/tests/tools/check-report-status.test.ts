import { describe, it, expect } from "vitest";
import { CheckReportStatusInputSchema } from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";

describe("CheckReportStatusInputSchema", () => {
  it("accepts valid report ID", () => {
    const result = CheckReportStatusInputSchema.safeParse({ reportId: "abc123def456" });
    expect(result.success).toBe(true);
  });

  it("requires reportId", () => {
    const result = CheckReportStatusInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty reportId", () => {
    const result = CheckReportStatusInputSchema.safeParse({ reportId: "" });
    expect(result.success).toBe(false);
  });

  it("accepts any non-empty string as reportId", () => {
    const result = CheckReportStatusInputSchema.safeParse({ reportId: "12345" });
    expect(result.success).toBe(true);
  });
});
