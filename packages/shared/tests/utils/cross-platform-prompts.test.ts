import { describe, it, expect } from "vitest";
import {
  CROSS_PLATFORM_PROMPTS,
  crossPlatformCampaignSetupPrompt,
  crossPlatformPerformancePrompt,
  getCrossPlatformCampaignSetupMessage,
  getCrossPlatformPerformanceMessage,
} from "../../src/utils/cross-platform-prompts.js";
import * as sharedRoot from "../../src/index.js";

describe("cross-platform prompt metadata", () => {
  it("keeps the prompt names every server has always registered", () => {
    expect(crossPlatformCampaignSetupPrompt.name).toBe("cross_platform_campaign_setup");
    expect(crossPlatformPerformancePrompt.name).toBe("cross_platform_performance_comparison");
  });

  it("keeps the historical arguments, all optional, and adds only optional ones", () => {
    const setupArgs = crossPlatformCampaignSetupPrompt.arguments.map((a) => a.name);
    expect(setupArgs).toEqual(["totalBudget", "objective", "currency"]);
    expect(crossPlatformPerformancePrompt.arguments.map((a) => a.name)).toEqual(["dateRange"]);
    for (const { prompt } of CROSS_PLATFORM_PROMPTS) {
      for (const arg of prompt.arguments) {
        expect(arg.required).toBe(false);
        expect(arg.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("pairs each prompt with its own generator", () => {
    expect(CROSS_PLATFORM_PROMPTS.map((p) => p.prompt.name)).toEqual([
      "cross_platform_performance_comparison",
      "cross_platform_campaign_setup",
    ]);
    expect(CROSS_PLATFORM_PROMPTS[0].generateMessage).toBe(getCrossPlatformPerformanceMessage);
    expect(CROSS_PLATFORM_PROMPTS[1].generateMessage).toBe(getCrossPlatformCampaignSetupMessage);
  });

  it("is exported from the package root, which is how servers import it", () => {
    expect(sharedRoot.crossPlatformCampaignSetupPrompt).toBe(crossPlatformCampaignSetupPrompt);
    expect(sharedRoot.getCrossPlatformPerformanceMessage).toBe(getCrossPlatformPerformanceMessage);
  });
});

describe("getCrossPlatformCampaignSetupMessage", () => {
  it("is deterministic", () => {
    const args = { totalBudget: "50000", objective: "awareness", currency: "EUR" };
    expect(getCrossPlatformCampaignSetupMessage(args)).toBe(
      getCrossPlatformCampaignSetupMessage({ ...args })
    );
  });

  it("renders defaults without any argument", () => {
    const text = getCrossPlatformCampaignSetupMessage();
    expect(text).toContain("Total Budget: {totalBudget} (account currency)");
    expect(text).toContain("Objective: `conversion`");
  });

  it("states the budget in the given currency, never a hard-coded dollar sign", () => {
    const text = getCrossPlatformCampaignSetupMessage({ totalBudget: "50000", currency: "EUR" });
    expect(text).toContain("Total Budget: 50000 EUR");
    expect(text).toContain("| DV360 | 15% | 50000 EUR × 0.15 |");
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/\$\{/);
  });

  it("never states a budget unit as dollars", () => {
    // The drift this module replaced: 9 copies said TTD/LinkedIn/TikTok/Amazon DSP
    // budgets were "in dollars"; amounts are in each account's own currency.
    const text = getCrossPlatformCampaignSetupMessage();
    expect(text).not.toMatch(/in dollars/i);
    expect(text).not.toMatch(/\| Dollars \|/);
  });

  it("does not claim LinkedIn budgets are cents (two copies did)", () => {
    const text = getCrossPlatformCampaignSetupMessage();
    expect(text).toContain('{ "amount": "100.00", "currencyCode": "USD" }');
    expect(text).not.toMatch(/LinkedIn[^\n]*Cents/);
  });

  it("covers every buying platform in the money-unit reference", () => {
    const text = getCrossPlatformCampaignSetupMessage();
    const reference = text.slice(text.indexOf("## Step 5"), text.indexOf("## Step 6"));
    for (const platform of [
      "DV360",
      "TTD",
      "Google Ads",
      "Microsoft Advertising",
      "Meta",
      "LinkedIn",
      "TikTok",
      "Pinterest",
      "Snapchat",
      "Amazon DSP",
    ]) {
      expect(reference).toContain(`| **${platform}** |`);
    }
  });
});

describe("getCrossPlatformPerformanceMessage", () => {
  it("defaults to LAST_7_DAYS", () => {
    const text = getCrossPlatformPerformanceMessage();
    expect(text).toContain("Date Range: `LAST_7_DAYS`");
    expect(text).toContain('"dateRange": "Last7Days"');
    expect(text).toContain('"dateRange": "LAST_7_DAYS"');
    expect(text).toContain('"datePreset": "last_7d"');
  });

  it("translates a preset into each tool's own date format", () => {
    const text = getCrossPlatformPerformanceMessage({ dateRange: "LAST_30_DAYS" });
    expect(text).toContain('"dateRange": "Last30Days"');
    expect(text).toContain('"dateRange": "LAST_30_DAYS"');
    expect(text).toContain('"datePreset": "last_30d"');
  });

  it("falls back to explicit dates for a range a tool has no preset for", () => {
    const text = getCrossPlatformPerformanceMessage({ dateRange: "2026-03-01 to 2026-03-31" });
    expect(text).toContain("Date Range: `2026-03-01 to 2026-03-31`");
    expect(text).toContain('"dateRange": "Custom"');
    expect(text).toContain('"timeRange": { "since": "{startDate}", "until": "{endDate}" }');
    expect(text).not.toContain('"dateRange": "2026-03-01 to 2026-03-31"');
  });

  it("uses dbm_get_performance_metrics' real parameters (startDate/endDate, not dateRange)", () => {
    const text = getCrossPlatformPerformanceMessage();
    const dbm = text.slice(
      text.indexOf("dbm_get_performance_metrics"),
      text.indexOf("Key metrics")
    );
    expect(dbm).toContain('"advertiserId"');
    expect(dbm).toContain('"startDate"');
    expect(dbm).not.toContain('"dateRange"');
    // Three copies had rewritten this to their own ID names.
    expect(text).not.toContain('"profileId": "{dv360AdvertiserId}"');
    expect(text).not.toContain('"adAccountId": "{dv360AdvertiserId}"');
  });

  it("does not claim non-TTD platforms report in USD by default", () => {
    expect(getCrossPlatformPerformanceMessage()).not.toMatch(/USD by default/);
  });
});
