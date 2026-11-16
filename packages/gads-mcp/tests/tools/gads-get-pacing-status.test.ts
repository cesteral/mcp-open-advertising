import { describe, it, expect } from "vitest";
import { getPacingStatusTool } from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";

const { inputSchema: GetPacingStatusInputSchema } = getPacingStatusTool;

describe("gads_get_pacing_status input schema", () => {
  const valid = {
    customerId: "1234567890",
    campaignId: "9876543",
    spendToDate: 2500,
    budgetTotal: 10000,
    flightStartDate: "2026-09-01",
    flightEndDate: "2026-10-31",
  };

  it("accepts a well-formed input", () => {
    expect(GetPacingStatusInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty campaignId", () => {
    expect(GetPacingStatusInputSchema.safeParse({ ...valid, campaignId: "" }).success).toBe(false);
  });

  it("rejects an empty or dashed customerId", () => {
    expect(GetPacingStatusInputSchema.safeParse({ ...valid, customerId: "" }).success).toBe(false);
    expect(
      GetPacingStatusInputSchema.safeParse({ ...valid, customerId: "123-456-7890" }).success
    ).toBe(false);
  });
});
