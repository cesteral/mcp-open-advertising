// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R4-U5 unit coverage: the Microsoft Ads dry-run path (symbolic validate +
 * symbolic apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runMsAdsUpdateDryRun,
  applyMsAdsPatch,
  resolveMsAdsDispatchedCapability,
  type MsAdsServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildMsAdsSnapshot,
  captureMsAdsSnapshot,
  snapshotFromMsAdsEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    Id: 111,
    Name: "Sample Campaign",
    Status: "Active",
    AccountId: 999,
    BudgetType: "DailyBudgetStandard",
    DailyBudget: 50,
    ...overrides,
  };
}

function budgetEntity(overrides: Record<string, unknown> = {}) {
  return {
    Id: 555,
    Name: "Shared Budget",
    Amount: 200,
    BudgetType: "DailyBudgetStandard",
    ...overrides,
  };
}

function adGroupEntity(overrides: Record<string, unknown> = {}) {
  return {
    Id: 222,
    Name: "Sample Ad Group",
    Status: "Active",
    StartDate: { Day: 1, Month: 1, Year: 2026 },
    EndDate: { Day: 31, Month: 12, Year: 2026 },
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): MsAdsServiceLike {
  return { getEntity: async () => ({ entities: [entity] }) };
}

describe("runMsAdsUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on a campaign", async () => {
    const result = await runMsAdsUpdateDryRun(
      { entityType: "campaign", entityId: "111", data: { Status: "Paused" }, readParams: {} },
      fakeService(campaignEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on Microsoft Ads — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("msads");
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.platformEntityId).toBe("111");
    expect(result.expectedPostState!.accountId).toBe("999");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "Paused",
    });
  });

  it("rejects an invalid status value", async () => {
    const result = await runMsAdsUpdateDryRun(
      { entityType: "campaign", entityId: "111", data: { Status: "BOGUS" }, readParams: {} },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATUS");
  });

  it("rejects a negative budget", async () => {
    const result = await runMsAdsUpdateDryRun(
      { entityType: "budget", entityId: "555", data: { Amount: -10 }, readParams: {} },
      fakeService(budgetEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("symbolically applies a campaign daily budget change (major → minor units)", async () => {
    const result = await runMsAdsUpdateDryRun(
      { entityType: "campaign", entityId: "111", data: { DailyBudget: 75 }, readParams: {} },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // 75 major units × 100 = 7,500 minor units; DailyBudget* → daily.
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 7_500,
      currency: "USD",
    });
    expect(result.expectedPostState!.budget.lifetime).toBeNull();
  });

  it("normalizes the shared budget entity's flat Amount", async () => {
    const result = await runMsAdsUpdateDryRun(
      { entityType: "budget", entityId: "555", data: { Amount: 250 }, readParams: {} },
      fakeService(budgetEntity()),
      ctx
    );
    expect(result.expectedPostState!.entityKind).toBe("campaign_budget");
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 25_000,
      currency: "USD",
    });
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runMsAdsUpdateDryRun(
        { entityType: "campaign", entityId: "111", data: { Status: "Paused" }, readParams: {} },
        {
          getEntity: async () => {
            throw new Error("campaign not found");
          },
        },
        ctx
      )
    ).rejects.toThrow(/campaign not found/);
  });
});

describe("resolveMsAdsDispatchedCapability", () => {
  it("maps status transitions to pause / resume / update_status", () => {
    expect(resolveMsAdsDispatchedCapability("campaign", { Status: "Paused" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "campaign",
    });
    expect(resolveMsAdsDispatchedCapability("adGroup", { Status: "Active" })).toEqual({
      operation: "resume",
      canonicalEntityKind: "ad_group",
    });
    expect(resolveMsAdsDispatchedCapability("ad", { Status: "Deleted" })).toEqual({
      operation: "update_status",
      canonicalEntityKind: "ad",
    });
  });

  it("maps a budget change to update_budget across the budget-bearing fields", () => {
    expect(resolveMsAdsDispatchedCapability("budget", { Amount: 250 })).toEqual({
      operation: "update_budget",
      canonicalEntityKind: "campaign_budget",
    });
    expect(resolveMsAdsDispatchedCapability("campaign", { DailyBudget: 100 })).toEqual({
      operation: "update_budget",
      canonicalEntityKind: "campaign",
    });
  });

  it("falls back to update for a non-status, non-budget patch", () => {
    expect(resolveMsAdsDispatchedCapability("campaign", { Name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "campaign",
    });
  });
});

describe("applyMsAdsPatch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applyMsAdsPatch("campaign", "111", campaignEntity(), { Status: "Paused" });
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Campaign");
  });
});

describe("buildMsAdsSnapshot / snapshotFromMsAdsEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildMsAdsSnapshot("keyword", "kw_1", {}, {})).toBeNull();
  });

  it("snapshotFromMsAdsEntity returns undefined for an empty entity", () => {
    expect(snapshotFromMsAdsEntity("campaign", "111", {})).toBeUndefined();
  });

  it("normalizes an ad group's date-object schedule", () => {
    const snapshot = buildMsAdsSnapshot("adGroup", "222", adGroupEntity(), {});
    expect(snapshot!.entityKind).toBe("ad_group");
    expect(snapshot!.schedule).toEqual({
      startAt: "2026-01-01",
      endAt: "2026-12-31",
    });
  });

  it("normalizes a campaign monthly budget to lifetime", () => {
    const snapshot = buildMsAdsSnapshot(
      "campaign",
      "111",
      campaignEntity({
        BudgetType: "MonthlyBudgetSpendUntilDepleted",
        DailyBudget: undefined,
        MonthlyBudget: 1500,
      }),
      {}
    );
    expect(snapshot!.budget.lifetime).toEqual({ amountMinor: 150_000, currency: "USD" });
    expect(snapshot!.budget.daily).toBeNull();
  });
});

describe("captureMsAdsSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureMsAdsSnapshot(
      fakeService(adGroupEntity()),
      "adGroup",
      "222",
      {},
      ctx
    );
    expect(snapshot!.entityKind).toBe("ad_group");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureMsAdsSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "campaign",
      "111",
      {},
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
