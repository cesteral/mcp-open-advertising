import { describe, it, expect } from "vitest";
import {
  GetPacingStatusInputSchema,
  getPacingStatusLogic,
  getPacingStatusResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";

const ctx = { requestId: "r" } as any;

/**
 * Fleet review ttd REST #31: the formatter hard-coded "$" whatever `currency`
 * the caller passed, so a EUR or GBP campaign's budget read as dollars.
 */
describe("ttd_get_pacing_status formatter", () => {
  it("labels amounts with the requested currency, not $", async () => {
    const input = GetPacingStatusInputSchema.parse({
      advertiserId: "adv1",
      campaignId: "camp1",
      spendToDate: 2500,
      budgetTotal: 10000,
      flightStartDate: "2026-09-01",
      flightEndDate: "2026-10-31",
      currency: "EUR",
    });
    const result = await getPacingStatusLogic(input, ctx);
    const text = getPacingStatusResponseFormatter(result)[0].text;

    expect(text).not.toContain("$");
    expect(text).toContain(`Total: ${(10000).toLocaleString()} EUR`);
    expect(text).toContain(`Spent: ${(2500).toLocaleString()} EUR`);
    expect(text).toMatch(/Projected End Spend: [\d.,]+ EUR/);
  });

  it("defaults to USD when no currency is given", async () => {
    const input = GetPacingStatusInputSchema.parse({
      advertiserId: "adv1",
      campaignId: "camp1",
      spendToDate: 100,
      budgetTotal: 1000,
      flightStartDate: "2026-09-01",
      flightEndDate: "2026-10-31",
    });
    const result = await getPacingStatusLogic(input, ctx);
    expect(getPacingStatusResponseFormatter(result)[0].text).toContain(
      `Total: ${(1000).toLocaleString()} USD`
    );
  });
});
