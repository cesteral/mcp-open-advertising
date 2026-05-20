// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R3-U4 unit coverage: the TikTok dry-run path (symbolic validate + symbolic
 * apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runTiktokUpdateDryRun,
  applyTiktokPatch,
  resolveTiktokDispatchedCapability,
  type TiktokServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildTiktokSnapshot,
  captureTiktokSnapshot,
  snapshotFromTiktokEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    campaign_id: "camp_1",
    campaign_name: "Sample Campaign",
    advertiser_id: "adv_1",
    status: "CAMPAIGN_STATUS_ENABLE",
    objective_type: "TRAFFIC",
    budget: 100,
    budget_mode: "BUDGET_MODE_DAY",
    ...overrides,
  };
}

function adGroupEntity(overrides: Record<string, unknown> = {}) {
  return {
    adgroup_id: "ag_1",
    adgroup_name: "Sample Ad Group",
    campaign_id: "camp_1",
    advertiser_id: "adv_1",
    status: "ADGROUP_STATUS_ENABLE",
    budget: 500,
    budget_mode: "BUDGET_MODE_TOTAL",
    ...overrides,
  };
}

function adEntity(overrides: Record<string, unknown> = {}) {
  return {
    ad_id: "ad_1",
    ad_name: "Sample Ad",
    adgroup_id: "ag_1",
    campaign_id: "camp_1",
    advertiser_id: "adv_1",
    status: "AD_STATUS_ENABLE",
    creative_type: "SINGLE_VIDEO",
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): TiktokServiceLike {
  return { getEntity: async () => entity };
}

describe("runTiktokUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on a campaign", async () => {
    const result = await runTiktokUpdateDryRun(
      { entityType: "campaign", entityId: "camp_1", data: { operation_status: "DISABLE" } },
      fakeService(campaignEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on TikTok — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("tiktok");
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.platformEntityId).toBe("camp_1");
    expect(result.expectedPostState!.accountId).toBe("adv_1");
    // operation_status is a write field — the symbolic merge does not touch
    // the read `status` field, so the snapshot status reflects pre-state.
    expect(result.expectedPostState!.status).toEqual({
      canonical: "active",
      platformRaw: "CAMPAIGN_STATUS_ENABLE",
    });
  });

  it("rejects an invalid operation_status value", async () => {
    const result = await runTiktokUpdateDryRun(
      { entityType: "campaign", entityId: "camp_1", data: { operation_status: "BOGUS" } },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_OPERATION_STATUS");
  });

  it("rejects a negative budget", async () => {
    const result = await runTiktokUpdateDryRun(
      { entityType: "campaign", entityId: "camp_1", data: { budget: -10 } },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("rejects an invalid budget_mode value", async () => {
    const result = await runTiktokUpdateDryRun(
      {
        entityType: "campaign",
        entityId: "camp_1",
        data: { budget: 100, budget_mode: "BUDGET_MODE_BOGUS" },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET_MODE");
  });

  it("symbolically applies a campaign daily budget change (major → minor units)", async () => {
    const result = await runTiktokUpdateDryRun(
      {
        entityType: "campaign",
        entityId: "camp_1",
        data: { budget: 200, budget_mode: "BUDGET_MODE_DAY" },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // 200 major units × 100 = 20,000 minor units; budget_mode BUDGET_MODE_DAY.
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 20_000,
      currency: "USD",
    });
    expect(result.expectedPostState!.budget.lifetime).toBeNull();
  });

  it("normalizes an ad-group's lifetime budget", async () => {
    const result = await runTiktokUpdateDryRun(
      {
        entityType: "adGroup",
        entityId: "ag_1",
        data: { budget: 1000, budget_mode: "BUDGET_MODE_TOTAL" },
      },
      fakeService(adGroupEntity()),
      ctx
    );
    expect(result.expectedPostState!.entityKind).toBe("ad_group");
    expect(result.expectedPostState!.budget.lifetime).toEqual({
      amountMinor: 100_000,
      currency: "USD",
    });
  });

  it("ad entities carry no budget in the snapshot", async () => {
    const result = await runTiktokUpdateDryRun(
      { entityType: "ad", entityId: "ad_1", data: { operation_status: "DISABLE" } },
      fakeService(adEntity()),
      ctx
    );
    expect(result.expectedPostState!.entityKind).toBe("ad");
    expect(result.expectedPostState!.budget).toEqual({ daily: null, lifetime: null });
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runTiktokUpdateDryRun(
        { entityType: "campaign", entityId: "camp_1", data: { operation_status: "DISABLE" } },
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

describe("resolveTiktokDispatchedCapability", () => {
  it("maps operation_status transitions to pause / resume / update_status", () => {
    expect(resolveTiktokDispatchedCapability("campaign", { operation_status: "DISABLE" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "campaign",
    });
    expect(resolveTiktokDispatchedCapability("adGroup", { operation_status: "ENABLE" })).toEqual({
      operation: "resume",
      canonicalEntityKind: "ad_group",
    });
    expect(resolveTiktokDispatchedCapability("ad", { operation_status: "DELETE" })).toEqual({
      operation: "update_status",
      canonicalEntityKind: "ad",
    });
  });

  it("maps a budget change to update_budget", () => {
    expect(resolveTiktokDispatchedCapability("campaign", { budget: 200 })).toEqual({
      operation: "update_budget",
      canonicalEntityKind: "campaign",
    });
    expect(
      resolveTiktokDispatchedCapability("adGroup", {
        budget: 1000,
        budget_mode: "BUDGET_MODE_TOTAL",
      })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "ad_group" });
  });

  it("falls back to update for a non-status, non-budget patch", () => {
    expect(resolveTiktokDispatchedCapability("campaign", { campaign_name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "campaign",
    });
  });
});

describe("applyTiktokPatch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applyTiktokPatch("campaign", "camp_1", campaignEntity(), {
      operation_status: "DISABLE",
    });
    // operation_status does not touch the read `status` field.
    expect(snapshot!.status.canonical).toBe("active");
    expect(snapshot!.displayName).toBe("Sample Campaign");
  });
});

describe("buildTiktokSnapshot / snapshotFromTiktokEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildTiktokSnapshot("creative", "cr_1", {}, {})).toBeNull();
  });

  it("snapshotFromTiktokEntity returns undefined for an empty entity", () => {
    expect(snapshotFromTiktokEntity("campaign", "camp_1", {})).toBeUndefined();
  });

  it("snapshotFromTiktokEntity normalizes the entity an update POST returns", () => {
    const snapshot = snapshotFromTiktokEntity(
      "campaign",
      "camp_1",
      campaignEntity({ status: "CAMPAIGN_STATUS_DISABLE" })
    );
    expect(snapshot!.status.canonical).toBe("paused");
  });

  it("maps a _DELETE-suffixed status to canonical deleted", () => {
    const snapshot = buildTiktokSnapshot(
      "ad",
      "ad_1",
      adEntity({ status: "AD_STATUS_DELETE" }),
      {}
    );
    expect(snapshot!.status).toEqual({ canonical: "deleted", platformRaw: "AD_STATUS_DELETE" });
  });
});

describe("captureTiktokSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureTiktokSnapshot(
      fakeService(adGroupEntity()),
      "adGroup",
      "ag_1",
      ctx
    );
    expect(snapshot!.entityKind).toBe("ad_group");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureTiktokSnapshot(
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
