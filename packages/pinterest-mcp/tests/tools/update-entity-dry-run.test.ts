// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R4-U4 unit coverage: the Pinterest dry-run path (symbolic validate +
 * symbolic apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runPinterestUpdateDryRun,
  applyPinterestPatch,
  resolvePinterestDispatchedCapability,
  type PinterestServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildPinterestSnapshot,
  capturePinterestSnapshot,
  snapshotFromPinterestEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1",
    name: "Sample Campaign",
    status: "ACTIVE",
    ad_account_id: "adaccount-1",
    daily_spend_cap: 100_000_000,
    start_time: 1767225600,
    end_time: 1798675200,
    ...overrides,
  };
}

function adGroupEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "adgroup-1",
    name: "Sample Ad Group",
    status: "ACTIVE",
    ad_account_id: "adaccount-1",
    campaign_id: "campaign-1",
    budget_in_micro_currency: 50_000_000,
    budget_type: "DAILY",
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): PinterestServiceLike {
  return { getEntity: async () => entity };
}

describe("runPinterestUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on a campaign", async () => {
    const result = await runPinterestUpdateDryRun(
      {
        entityType: "campaign",
        adAccountId: "adaccount-1",
        entityId: "campaign-1",
        data: { status: "PAUSED" },
      },
      fakeService(campaignEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on Pinterest — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("pinterest");
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.platformEntityId).toBe("campaign-1");
    expect(result.expectedPostState!.accountId).toBe("adaccount-1");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "PAUSED",
    });
  });

  it("rejects an invalid status value", async () => {
    const result = await runPinterestUpdateDryRun(
      {
        entityType: "campaign",
        adAccountId: "adaccount-1",
        entityId: "campaign-1",
        data: { status: "BOGUS" },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATUS");
  });

  it("rejects a negative budget", async () => {
    const result = await runPinterestUpdateDryRun(
      {
        entityType: "campaign",
        adAccountId: "adaccount-1",
        entityId: "campaign-1",
        data: { daily_spend_cap: -10 },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("symbolically applies a campaign budget change (micro → minor units)", async () => {
    const result = await runPinterestUpdateDryRun(
      {
        entityType: "campaign",
        adAccountId: "adaccount-1",
        entityId: "campaign-1",
        data: { daily_spend_cap: 200_000_000 },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // 200,000,000 micro ÷ 10,000 = 20,000 minor units.
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 20_000,
      currency: "USD",
    });
    expect(result.expectedPostState!.budget.lifetime).toBeNull();
  });

  it("normalizes an ad group's budget by budget_type", async () => {
    const result = await runPinterestUpdateDryRun(
      {
        entityType: "adGroup",
        adAccountId: "adaccount-1",
        entityId: "adgroup-1",
        data: { budget_in_micro_currency: 80_000_000 },
      },
      fakeService(adGroupEntity()),
      ctx
    );
    expect(result.expectedPostState!.entityKind).toBe("ad_group");
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 8_000,
      currency: "USD",
    });
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runPinterestUpdateDryRun(
        {
          entityType: "campaign",
          adAccountId: "adaccount-1",
          entityId: "campaign-1",
          data: { status: "PAUSED" },
        },
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

describe("resolvePinterestDispatchedCapability", () => {
  it("maps status transitions to pause / resume / update_status", () => {
    expect(resolvePinterestDispatchedCapability("campaign", { status: "PAUSED" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "campaign",
    });
    expect(resolvePinterestDispatchedCapability("adGroup", { status: "ACTIVE" })).toEqual({
      operation: "resume",
      canonicalEntityKind: "ad_group",
    });
    expect(resolvePinterestDispatchedCapability("campaign", { status: "ARCHIVED" })).toEqual({
      operation: "update_status",
      canonicalEntityKind: "campaign",
    });
  });

  it("maps a budget change to update_budget across campaign and ad group", () => {
    expect(
      resolvePinterestDispatchedCapability("campaign", { lifetime_spend_cap: 50_000_000 })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "campaign" });
    expect(
      resolvePinterestDispatchedCapability("adGroup", { budget_in_micro_currency: 1_000_000 })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "ad_group" });
  });

  it("falls back to update for a non-status, non-budget patch", () => {
    expect(resolvePinterestDispatchedCapability("ad", { name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "ad",
    });
  });
});

describe("applyPinterestPatch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applyPinterestPatch("campaign", "campaign-1", campaignEntity(), {
      status: "PAUSED",
    });
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Campaign");
  });
});

describe("buildPinterestSnapshot / snapshotFromPinterestEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildPinterestSnapshot("creative", "pin-1", {}, {})).toBeNull();
  });

  it("snapshotFromPinterestEntity returns undefined for an empty entity", () => {
    expect(snapshotFromPinterestEntity("campaign", "campaign-1", {})).toBeUndefined();
  });

  it("snapshotFromPinterestEntity normalizes the entity a PATCH returns", () => {
    const snapshot = snapshotFromPinterestEntity(
      "campaign",
      "campaign-1",
      campaignEntity({ status: "PAUSED" })
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.schedule).toEqual({
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    });
  });

  it("normalizes an ad with no budget", () => {
    const snapshot = buildPinterestSnapshot(
      "ad",
      "ad-1",
      { id: "ad-1", name: "Sample Ad", status: "ACTIVE", ad_account_id: "adaccount-1" },
      {}
    );
    expect(snapshot!.entityKind).toBe("ad");
    expect(snapshot!.budget).toEqual({ daily: null, lifetime: null });
  });
});

describe("capturePinterestSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await capturePinterestSnapshot(
      fakeService(adGroupEntity()),
      "adGroup",
      "adaccount-1",
      "adgroup-1",
      ctx
    );
    expect(snapshot!.entityKind).toBe("ad_group");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await capturePinterestSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "campaign",
      "adaccount-1",
      "campaign-1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
