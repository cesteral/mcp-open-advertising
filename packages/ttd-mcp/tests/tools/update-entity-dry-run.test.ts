// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R3-U2 unit coverage: the TTD dry-run path (symbolic validate + symbolic
 * apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runTtdUpdateDryRun,
  applyTtdPatch,
  resolveTtdDispatchedCapability,
  type TtdServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildTtdSnapshot,
  captureTtdSnapshot,
  snapshotFromTtdEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    CampaignId: "camp_1",
    CampaignName: "Sample Campaign",
    AdvertiserId: "adv_1",
    Availability: "Available",
    Budget: { Amount: 50000, CurrencyCode: "USD" },
    DailyBudget: { Amount: 500, CurrencyCode: "USD" },
    StartDateInclusiveUTC: "2026-01-01T00:00:00Z",
    EndDateExclusiveUTC: "2026-12-31T00:00:00Z",
    ...overrides,
  };
}

function adGroupEntity(overrides: Record<string, unknown> = {}) {
  return {
    AdGroupId: "ag_1",
    AdGroupName: "Sample Ad Group",
    CampaignId: "camp_1",
    AdvertiserId: "adv_1",
    Availability: "Available",
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): TtdServiceLike {
  return { getEntity: async () => entity };
}

describe("runTtdUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on a campaign", async () => {
    const result = await runTtdUpdateDryRun(
      { entityType: "campaign", entityId: "camp_1", data: { Availability: "Paused" } },
      fakeService(campaignEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on TTD — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("ttd");
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.platformEntityId).toBe("camp_1");
    expect(result.expectedPostState!.accountId).toBe("adv_1");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "Paused",
    });
  });

  it("rejects an invalid Availability value", async () => {
    const result = await runTtdUpdateDryRun(
      { entityType: "campaign", entityId: "camp_1", data: { Availability: "BOGUS" } },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_AVAILABILITY");
  });

  it("rejects a negative budget", async () => {
    const result = await runTtdUpdateDryRun(
      {
        entityType: "campaign",
        entityId: "camp_1",
        data: { Budget: { Amount: -10, CurrencyCode: "USD" } },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("symbolically applies a campaign budget change (major → minor units)", async () => {
    const result = await runTtdUpdateDryRun(
      {
        entityType: "campaign",
        entityId: "camp_1",
        data: { Budget: { Amount: 75000, CurrencyCode: "USD" } },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // 75,000 major units × 100 = 7,500,000 minor units.
    expect(result.expectedPostState!.budget.lifetime).toEqual({
      amountMinor: 7_500_000,
      currency: "USD",
    });
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 50_000,
      currency: "USD",
    });
  });

  it("leaves an ad-group snapshot with no budget (out of round-3 scope)", async () => {
    const result = await runTtdUpdateDryRun(
      { entityType: "adGroup", entityId: "ag_1", data: { Availability: "Paused" } },
      fakeService(adGroupEntity()),
      ctx
    );
    expect(result.expectedPostState!.entityKind).toBe("ad_group");
    expect(result.expectedPostState!.budget).toEqual({ daily: null, lifetime: null });
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runTtdUpdateDryRun(
        { entityType: "campaign", entityId: "camp_1", data: { Availability: "Paused" } },
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

describe("resolveTtdDispatchedCapability", () => {
  it("maps Availability transitions to pause / resume / update_status", () => {
    expect(resolveTtdDispatchedCapability("campaign", { Availability: "Paused" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "campaign",
    });
    expect(resolveTtdDispatchedCapability("adGroup", { Availability: "Available" })).toEqual({
      operation: "resume",
      canonicalEntityKind: "ad_group",
    });
    expect(resolveTtdDispatchedCapability("campaign", { Availability: "Archived" })).toEqual({
      operation: "update_status",
      canonicalEntityKind: "campaign",
    });
  });

  it("maps a budget change to update_budget", () => {
    expect(
      resolveTtdDispatchedCapability("campaign", { Budget: { Amount: 50000, CurrencyCode: "USD" } })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "campaign" });
    expect(
      resolveTtdDispatchedCapability("campaign", {
        DailyBudget: { Amount: 100, CurrencyCode: "USD" },
      })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "campaign" });
  });

  it("falls back to update for a non-status, non-budget patch", () => {
    expect(resolveTtdDispatchedCapability("campaign", { CampaignName: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "campaign",
    });
  });
});

describe("applyTtdPatch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applyTtdPatch("campaign", "camp_1", campaignEntity(), {
      Availability: "Paused",
    });
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Campaign");
  });
});

describe("buildTtdSnapshot / snapshotFromTtdEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildTtdSnapshot("creative", "cr_1", {}, {})).toBeNull();
  });

  it("snapshotFromTtdEntity returns undefined for an empty entity", () => {
    expect(snapshotFromTtdEntity("campaign", "camp_1", {})).toBeUndefined();
  });

  it("snapshotFromTtdEntity normalizes the entity a PUT returns", () => {
    const snapshot = snapshotFromTtdEntity(
      "campaign",
      "camp_1",
      campaignEntity({ Availability: "Paused" })
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.schedule).toEqual({
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-12-31T00:00:00Z",
    });
  });
});

describe("captureTtdSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureTtdSnapshot(fakeService(adGroupEntity()), "adGroup", "ag_1", ctx);
    expect(snapshot!.entityKind).toBe("ad_group");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureTtdSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "campaign",
      "camp_1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
