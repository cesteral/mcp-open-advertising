import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createPacingTool } from "../../src/utils/mcp/pacing-tool-factory.js";
import { NO_UNTRUSTED_CONTENT } from "../../src/utils/mcp/untrusted-content.js";

const ctx = { requestId: "r" } as never;

const tiktok = createPacingTool({
  toolName: "tiktok_get_pacing_status",
  accountId: { field: "advertiserId", schema: z.string().min(1).describe("TikTok Advertiser ID") },
  campaignIdSchema: z.string().min(1).describe("TikTok Campaign ID to check pacing for"),
  platformApi: "the TikTok API",
  populateGuidance: "To populate spend, first call `tiktok_get_report`.",
  exampleIds: [
    { accountId: "6987654321098765432", campaignId: "1798765432109876" },
    { accountId: "6912345678901234567", campaignId: "1712345678901234" },
  ],
});

const meta = createPacingTool({
  toolName: "meta_get_pacing_status",
  // Deliberately no `.min(1)`: the factory publishes whatever schema it is handed.
  accountId: { field: "adAccountId", schema: z.string().describe("Meta Ad Account ID") },
  campaignIdSchema: z.string().describe("Meta Campaign ID"),
  platformApi: "the Meta API",
  populateGuidance: "Meta guidance.",
  descriptions: {
    spendToDate: "Spend in the major unit",
    budgetTotal: "Budget in the major unit",
  },
  exampleIds: [
    { accountId: "act_1", campaignId: "11" },
    { accountId: "act_2", campaignId: "22" },
  ],
});

const baseInput = {
  campaignId: "c1",
  spendToDate: 2500,
  budgetTotal: 10000,
  flightStartDate: "2026-09-01",
  flightEndDate: "2026-10-31",
};

describe("createPacingTool", () => {
  it("uses the given tool name and keeps the shared title", () => {
    expect(tiktok.name).toBe("tiktok_get_pacing_status");
    expect(tiktok.title).toBe("Calculate Campaign Pacing (Client-Side)");
  });

  it("composes the description from the shared lead-in and the platform guidance", () => {
    expect(tiktok.description).toBe(
      "Client-side pacing calculator — does NOT call the TikTok API. " +
        "Computes actual vs expected delivery given caller-supplied budget, spend-to-date, and flight dates. " +
        "To populate spend, first call `tiktok_get_report`."
    );
  });

  it("is read-only, never touches the platform, and declares no untrusted content", () => {
    expect(tiktok.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    });
    expect(tiktok.annotations).not.toHaveProperty("cesteral");
    expect(tiktok.untrustedContent).toBe(NO_UNTRUSTED_CONTENT);
  });

  it("publishes the account id first, under the platform's own field name", () => {
    const shape = (tiktok.inputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    expect(Object.keys(shape)).toEqual([
      "advertiserId",
      "campaignId",
      "spendToDate",
      "budgetTotal",
      "flightStartDate",
      "flightEndDate",
      "currency",
    ]);
    const outShape = (tiktok.outputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    expect(Object.keys(outShape)[0]).toBe("advertiserId");
  });

  it("passes the server's id schemas through untouched", () => {
    expect(tiktok.inputSchema.safeParse({ ...baseInput, advertiserId: "" }).success).toBe(false);
    expect(meta.inputSchema.safeParse({ ...baseInput, adAccountId: "" }).success).toBe(true);
  });

  it("applies description overrides only where given", () => {
    const shape = (meta.inputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    expect(shape.spendToDate.description).toBe("Spend in the major unit");
    expect(shape.budgetTotal.description).toBe("Budget in the major unit");
    const defaults = (tiktok.inputSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    expect(defaults.spendToDate.description).toBe("Total spend to date in account currency");
    expect(defaults.budgetTotal.description).toBe("Total campaign budget in account currency");
  });

  it("defaults currency to USD and rejects malformed or negative input", () => {
    const parsed = tiktok.inputSchema.parse({ ...baseInput, advertiserId: "a" });
    expect(parsed.currency).toBe("USD");
    expect(
      tiktok.inputSchema.safeParse({ ...baseInput, advertiserId: "a", flightStartDate: "09/01/26" })
        .success
    ).toBe(false);
    expect(
      tiktok.inputSchema.safeParse({ ...baseInput, advertiserId: "a", spendToDate: -1 }).success
    ).toBe(false);
  });

  it("publishes two examples that validate against the input schema", () => {
    for (const tool of [tiktok, meta]) {
      expect(tool.inputExamples).toHaveLength(2);
      for (const example of tool.inputExamples ?? []) {
        expect(tool.inputSchema.safeParse(example.input).success).toBe(true);
      }
    }
    expect(tiktok.inputExamples?.[0]?.input).toMatchObject({
      advertiserId: "6987654321098765432",
      campaignId: "1798765432109876",
    });
    expect(meta.inputExamples?.[1]?.input).toMatchObject({
      adAccountId: "act_2",
      campaignId: "22",
    });
  });

  it("echoes the account id under its own field name and computes the budget block", async () => {
    const input = tiktok.inputSchema.parse({
      ...baseInput,
      advertiserId: "adv1",
      currency: "EUR",
    });
    const result = await tiktok.logic(input, ctx);

    expect(result.advertiserId).toBe("adv1");
    expect(result).not.toHaveProperty("adAccountId");
    expect(result.campaignId).toBe("c1");
    expect(result.budget).toEqual({ total: 10000, spent: 2500, remaining: 7500, currency: "EUR" });
    expect(result.flight).toMatchObject({ startDate: "2026-09-01", endDate: "2026-10-31" });
    expect(["ON_PACE", "AHEAD", "BEHIND", "SEVERELY_BEHIND"]).toContain(result.pacing.status);
    expect(tiktok.outputSchema.safeParse(result).success).toBe(true);
  });

  it("never reports a negative remaining budget", async () => {
    const input = tiktok.inputSchema.parse({
      ...baseInput,
      advertiserId: "adv1",
      spendToDate: 12000,
    });
    expect((await tiktok.logic(input, ctx)).budget.remaining).toBe(0);
  });

  it("labels amounts with the requested currency, not $", async () => {
    const input = tiktok.inputSchema.parse({
      ...baseInput,
      advertiserId: "adv1",
      currency: "GBP",
    });
    const text = tiktok.responseFormatter(await tiktok.logic(input, ctx))[0]!.text;

    expect(text).not.toContain("$");
    expect(text).toContain(`Total: ${(10000).toLocaleString()} GBP`);
    expect(text).toContain(`Spent: ${(2500).toLocaleString()} GBP`);
    expect(text).toMatch(/Projected End Spend: [\d.,]+ GBP/);
    expect(text).toContain('Campaign "c1" Pacing Status:');
  });

  it("maps each status to its text marker", () => {
    const base = {
      advertiserId: "a",
      campaignId: "c",
      budget: { total: 1, spent: 1, remaining: 0, currency: "USD" },
      flight: { startDate: "s", endDate: "e", daysElapsed: 1, daysRemaining: 1, totalDays: 2 },
      timestamp: "2026-09-01T00:00:00.000Z",
    };
    const pacing = (status: "ON_PACE" | "AHEAD" | "BEHIND" | "SEVERELY_BEHIND") => ({
      expectedSpendPercent: 50,
      actualSpendPercent: 50,
      pacingRatio: 1,
      projectedEndSpend: 1,
      status,
    });
    const marker = {
      ON_PACE: "[OK]",
      AHEAD: "[AHEAD]",
      BEHIND: "[BEHIND]",
      SEVERELY_BEHIND: "[CRITICAL]",
    } as const;
    for (const status of Object.keys(marker) as (keyof typeof marker)[]) {
      const text = tiktok.responseFormatter({ ...base, pacing: pacing(status) })[0]!.text;
      expect(text).toContain(`${marker[status]} Status: ${status}`);
    }
  });
});
