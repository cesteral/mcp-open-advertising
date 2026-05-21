// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R4-U3 unit coverage: the Snapchat dry-run path (symbolic validate +
 * symbolic apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runSnapchatUpdateDryRun,
  applySnapchatPatch,
  resolveSnapchatDispatchedCapability,
  type SnapchatServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildSnapchatSnapshot,
  captureSnapchotSnapshot,
  snapshotFromSnapchatEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign_1",
    name: "Sample Campaign",
    status: "ACTIVE",
    objective: "WEB_CONVERSION",
    ad_account_id: "adacc_1",
    daily_budget_micro: 150_000_000,
    start_time: "2026-01-01T00:00:00.000Z",
    end_time: "2026-12-31T00:00:00.000Z",
    ...overrides,
  };
}

function adSquadEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "adsquad_1",
    name: "Sample Ad Squad",
    status: "ACTIVE",
    campaign_id: "campaign_1",
    ad_account_id: "adacc_1",
    optimization_goal: "SWIPES",
    billing_event: "IMPRESSION",
    daily_budget_micro: 50_000_000,
    ...overrides,
  };
}

function adEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "ad_1",
    name: "Sample Ad",
    status: "ACTIVE",
    ad_squad_id: "adsquad_1",
    creative_id: "creative_1",
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): SnapchatServiceLike {
  return { getEntity: async () => entity };
}

describe("runSnapchatUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on a campaign", async () => {
    const result = await runSnapchatUpdateDryRun(
      { entityType: "campaign", entityId: "campaign_1", data: { status: "PAUSED" } },
      fakeService(campaignEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on Snapchat — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("snapchat");
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.platformEntityId).toBe("campaign_1");
    expect(result.expectedPostState!.accountId).toBe("adacc_1");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "PAUSED",
    });
  });

  it("rejects an invalid status value", async () => {
    const result = await runSnapchatUpdateDryRun(
      { entityType: "campaign", entityId: "campaign_1", data: { status: "BOGUS" } },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATUS");
  });

  it("rejects a negative budget", async () => {
    const result = await runSnapchatUpdateDryRun(
      {
        entityType: "campaign",
        entityId: "campaign_1",
        data: { daily_budget_micro: -10 },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("symbolically applies a campaign budget change (micro → minor units)", async () => {
    const result = await runSnapchatUpdateDryRun(
      {
        entityType: "campaign",
        entityId: "campaign_1",
        data: { daily_budget_micro: 200_000_000 },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // 200,000,000 micros ÷ 10,000 = 20,000 minor units ($200.00).
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 20_000,
      currency: "USD",
    });
    expect(result.expectedPostState!.budget.lifetime).toBeNull();
  });

  it("normalizes an ad squad's daily budget", async () => {
    const result = await runSnapchatUpdateDryRun(
      {
        entityType: "adGroup",
        entityId: "adsquad_1",
        data: { daily_budget_micro: 75_000_000 },
      },
      fakeService(adSquadEntity()),
      ctx
    );
    expect(result.expectedPostState!.entityKind).toBe("ad_group");
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 7_500,
      currency: "USD",
    });
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runSnapchatUpdateDryRun(
        { entityType: "campaign", entityId: "campaign_1", data: { status: "PAUSED" } },
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

describe("resolveSnapchatDispatchedCapability", () => {
  it("maps status transitions to pause / resume", () => {
    expect(resolveSnapchatDispatchedCapability("campaign", { status: "PAUSED" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "campaign",
    });
    expect(resolveSnapchatDispatchedCapability("adGroup", { status: "ACTIVE" })).toEqual({
      operation: "resume",
      canonicalEntityKind: "ad_group",
    });
    expect(resolveSnapchatDispatchedCapability("ad", { status: "PAUSED" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "ad",
    });
  });

  it("maps a budget change to update_budget", () => {
    expect(
      resolveSnapchatDispatchedCapability("campaign", { daily_budget_micro: 50_000_000 })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "campaign" });
    expect(
      resolveSnapchatDispatchedCapability("adGroup", { lifetime_budget_micro: 100_000_000 })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "ad_group" });
  });

  it("falls back to update for a non-status, non-budget patch", () => {
    expect(resolveSnapchatDispatchedCapability("campaign", { name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "campaign",
    });
  });

  it("falls back to unknown for an out-of-scope entity type", () => {
    expect(resolveSnapchatDispatchedCapability("creative", { name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "creative",
    });
  });
});

describe("applySnapchatPatch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applySnapchatPatch("campaign", "campaign_1", campaignEntity(), {
      status: "PAUSED",
    });
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Campaign");
  });
});

describe("buildSnapchatSnapshot / snapshotFromSnapchatEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildSnapchatSnapshot("creative", "creative_1", {}, {})).toBeNull();
  });

  it("snapshotFromSnapchatEntity returns undefined for an empty entity", () => {
    expect(snapshotFromSnapchatEntity("campaign", "campaign_1", {})).toBeUndefined();
  });

  it("snapshotFromSnapchatEntity normalizes the entity a PUT returns", () => {
    const snapshot = snapshotFromSnapchatEntity(
      "campaign",
      "campaign_1",
      campaignEntity({ status: "PAUSED" })
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.schedule).toEqual({
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    });
  });

  it("normalizes an ad with no budget or schedule", () => {
    const snapshot = snapshotFromSnapchatEntity("ad", "ad_1", adEntity({ status: "PAUSED" }));
    expect(snapshot!.entityKind).toBe("ad");
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.budget).toEqual({ daily: null, lifetime: null });
    expect(snapshot!.schedule).toEqual({ startAt: null, endAt: null });
    expect(snapshot!.accountId).toBeNull();
  });
});

describe("captureSnapchotSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureSnapchotSnapshot(
      fakeService(adSquadEntity()),
      "adGroup",
      "adsquad_1",
      ctx
    );
    expect(snapshot!.entityKind).toBe("ad_group");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureSnapchotSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "campaign",
      "campaign_1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });

  it("returns undefined for an out-of-scope entity type", async () => {
    const snapshot = await captureSnapchotSnapshot(
      fakeService(campaignEntity()),
      "creative",
      "creative_1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
