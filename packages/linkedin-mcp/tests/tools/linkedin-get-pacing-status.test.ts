import { describe, it, expect } from "vitest";
import {
  GetPacingStatusInputSchema,
  getPacingStatusLogic,
  getPacingStatusResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";

const ctx = { requestId: "r" } as any;

/**
 * Fleet review 2026-09 (ttd REST #31 follow-up): the formatter hard-coded "$"
 * whatever `currency` the caller passed, so a EUR account's budget read as dollars.
 */
describe("linkedin_get_pacing_status formatter", () => {
  it("labels amounts with the requested currency, not $", async () => {
    const input = GetPacingStatusInputSchema.parse({
      accountId: "503491473",
      campaignId: "camp1",
      spendToDate: 2500,
      budgetTotal: 10000,
      flightStartDate: "2026-09-01",
      flightEndDate: "2026-10-31",
      currency: "EUR",
    });
    const result = await getPacingStatusLogic(input, ctx);
    const text = getPacingStatusResponseFormatter(result, input)[0].text;

    expect(text).not.toContain("$");
    expect(text).toContain(`Total: ${(10000).toLocaleString()} EUR`);
    expect(text).toContain(`Spent: ${(2500).toLocaleString()} EUR`);
    expect(text).toContain(`Remaining: ${(7500).toLocaleString()} EUR`);
    expect(text).toMatch(/Projected End Spend: [\d.,]+ EUR/);
  });
});
