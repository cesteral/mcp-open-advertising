// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * metricContext, driven through the real tool logic (#200).
 *
 * `metric-context.test.ts` in @cesteral/shared proves the builder's omission
 * rules. This file proves the wiring: that the values a caller actually supplies
 * reach the response, and — more importantly — that the ones Meta resolves
 * server-side do NOT appear as though we knew them.
 *
 * Meta is the interesting case for both halves of the contract:
 *   - `timeRange` is a concrete window the caller gave us, so it is knowable.
 *   - `datePreset` is expanded by Meta, so the window is NOT knowable here.
 *   - `actionAttributionWindows` is knowable only when named; otherwise Meta
 *     applies an account default we cannot see.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { getInsightsLogic } from "../../src/mcp-server/tools/definitions/get-insights.tool.js";
import { getInsightsBreakdownsLogic } from "../../src/mcp-server/tools/definitions/get-insights-breakdowns.tool.js";

const context = { requestId: "req-1", timestamp: new Date().toISOString(), operation: "t" } as any;
const sdkContext = { sessionId: "s-1" } as any;
const ROWS = [{ impressions: "100", clicks: "10", spend: "5.00" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSessionServices.mockReturnValue({
    metaInsightsService: {
      getInsights: vi.fn().mockResolvedValue({ data: ROWS, nextCursor: undefined }),
      getInsightsBreakdowns: vi.fn().mockResolvedValue({ data: ROWS, nextCursor: undefined }),
    },
  });
});

describe("meta_get_insights metricContext", () => {
  it("reports the source even when nothing else is knowable", async () => {
    const out: any = await getInsightsLogic(
      { entityId: "act_1", datePreset: "last_7d" } as any,
      context,
      sdkContext
    );

    expect(out.metricContext).toEqual({ source: "meta_ads" });
  });

  it("omits dateRange for a preset Meta expands server-side", async () => {
    // The honest case. We know a window was applied; we do not know which one.
    // Emitting a guess would be indistinguishable from a resolved window.
    const out: any = await getInsightsLogic(
      { entityId: "act_1", datePreset: "last_30d" } as any,
      context,
      sdkContext
    );

    expect("dateRange" in out.metricContext).toBe(false);
  });

  it("reports the resolved window when the caller supplied one", async () => {
    const out: any = await getInsightsLogic(
      { entityId: "act_1", timeRange: { since: "2026-08-01", until: "2026-08-31" } } as any,
      context,
      sdkContext
    );

    expect(out.metricContext.dateRange).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });
});

describe("meta_get_insights_breakdowns metricContext", () => {
  it("reports the attribution window the caller named, bound to conversion metrics", async () => {
    const out: any = await getInsightsBreakdownsLogic(
      {
        entityId: "act_1",
        breakdowns: ["country"],
        datePreset: "last_7d",
        actionAttributionWindows: ["1d_click", "7d_click"],
      } as any,
      context,
      sdkContext
    );

    expect(out.metricContext.conversionBasis).toEqual({
      attributionWindow: "1d_click,7d_click",
      appliesTo: ["cpa", "roas"],
    });
  });

  it("omits conversionBasis when the caller named no window", async () => {
    // Meta falls back to an account default that this server cannot observe, so
    // silence is the only honest answer — and it is what lets a client refuse to
    // compare this against another platform.
    const out: any = await getInsightsBreakdownsLogic(
      { entityId: "act_1", breakdowns: ["country"], datePreset: "last_7d" } as any,
      context,
      sdkContext
    );

    expect("conversionBasis" in out.metricContext).toBe(false);
  });

  it("carries window and attribution together when both are known", async () => {
    const out: any = await getInsightsBreakdownsLogic(
      {
        entityId: "act_1",
        breakdowns: ["country"],
        timeRange: { since: "2026-08-01", until: "2026-08-31" },
        actionAttributionWindows: ["7d_click"],
      } as any,
      context,
      sdkContext
    );

    expect(out.metricContext).toEqual({
      source: "meta_ads",
      dateRange: { start: "2026-08-01", end: "2026-08-31" },
      conversionBasis: { attributionWindow: "7d_click", appliesTo: ["cpa", "roas"] },
    });
  });

  it("never claims a currency or timezone it did not read", async () => {
    // Neither is available from Meta's insights response, and a plausible
    // default (USD, the account's locale) would be a fabricated fact.
    const out: any = await getInsightsBreakdownsLogic(
      { entityId: "act_1", breakdowns: ["country"], datePreset: "last_7d" } as any,
      context,
      sdkContext
    );

    expect("currency" in out.metricContext).toBe(false);
    expect("timezone" in out.metricContext).toBe(false);
  });
});
