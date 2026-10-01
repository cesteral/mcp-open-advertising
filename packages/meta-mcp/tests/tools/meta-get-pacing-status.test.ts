import { describe, it, expect } from "vitest";
import {
  GetPacingStatusInputSchema,
  getPacingStatusLogic,
  getPacingStatusResponseFormatter,
  getPacingStatusTool,
} from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";

const ctx = { requestId: "r" } as any;

/**
 * Fleet review 2026-09, meta #21: the formatter printed "$" whatever `currency`
 * the caller passed, and the description sent callers to two sources that
 * report money in different units without saying so.
 */
describe("meta_get_pacing_status", () => {
  it("labels amounts with the requested currency, not $", async () => {
    const input = GetPacingStatusInputSchema.parse({
      adAccountId: "act_1",
      campaignId: "c1",
      spendToDate: 2500,
      budgetTotal: 10000,
      flightStartDate: "2026-09-01",
      flightEndDate: "2026-10-31",
      currency: "JPY",
    });
    const result = await getPacingStatusLogic(input, ctx);
    const text = getPacingStatusResponseFormatter(result, input)[0].text;

    expect(text).not.toContain("$");
    expect(text).toContain(`Total: ${(10000).toLocaleString()} JPY`);
    expect(text).toContain(`Spent: ${(2500).toLocaleString()} JPY`);
    expect(text).toMatch(/Projected End Spend: [\d.,]+ JPY/);
  });

  it("tells callers the entity budget and insights spend use different units", () => {
    expect(getPacingStatusTool.description).toMatch(/minor unit/);
    expect(getPacingStatusTool.description).toMatch(/major unit/);
  });
});
