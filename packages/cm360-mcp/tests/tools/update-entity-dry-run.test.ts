// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R4-U2 unit coverage: the CM360 dry-run path (symbolic validate + symbolic
 * apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runCm360UpdateDryRun,
  applyCm360Patch,
  resolveCm360DispatchedCapability,
  type Cm360ServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildCm360Snapshot,
  captureCm360Snapshot,
  snapshotFromCm360Entity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "camp_1",
    kind: "dfareporting#campaign",
    name: "Sample Campaign",
    accountId: "acct_1",
    advertiserId: "adv_1",
    archived: false,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    ...overrides,
  };
}

function adEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "ad_1",
    kind: "dfareporting#ad",
    name: "Sample Ad",
    accountId: "acct_1",
    advertiserId: "adv_1",
    campaignId: "camp_1",
    active: true,
    archived: false,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-12-31T00:00:00Z",
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): Cm360ServiceLike {
  return { getEntity: async () => entity };
}

describe("runCm360UpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on an ad", async () => {
    const result = await runCm360UpdateDryRun(
      { entityType: "ad", profileId: "p_1", entityId: "ad_1", data: { active: false } },
      fakeService(adEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on CM360 — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("cm360");
    expect(result.expectedPostState!.entityKind).toBe("ad");
    expect(result.expectedPostState!.platformEntityId).toBe("ad_1");
    expect(result.expectedPostState!.accountId).toBe("acct_1");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "active=false,archived=false",
    });
    // CM360 entities carry no budget.
    expect(result.expectedPostState!.budget).toEqual({ daily: null, lifetime: null });
  });

  it("symbolically applies a campaign archive", async () => {
    const result = await runCm360UpdateDryRun(
      { entityType: "campaign", profileId: "p_1", entityId: "camp_1", data: { archived: true } },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "archived",
      platformRaw: "archived=true",
    });
    expect(result.expectedPostState!.schedule).toEqual({
      startAt: "2026-01-01",
      endAt: "2026-12-31",
    });
  });

  it("rejects a non-boolean archived value", async () => {
    const result = await runCm360UpdateDryRun(
      {
        entityType: "campaign",
        profileId: "p_1",
        entityId: "camp_1",
        data: { archived: "yes" },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATUS");
  });

  it("rejects an ad that is both active and archived", async () => {
    const result = await runCm360UpdateDryRun(
      {
        entityType: "ad",
        profileId: "p_1",
        entityId: "ad_1",
        data: { active: true, archived: true },
      },
      fakeService(adEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATUS");
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runCm360UpdateDryRun(
        { entityType: "campaign", profileId: "p_1", entityId: "camp_1", data: { archived: true } },
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

describe("resolveCm360DispatchedCapability", () => {
  it("maps an ad active flip to pause / resume", () => {
    expect(resolveCm360DispatchedCapability("ad", { active: false })).toEqual({
      operation: "pause",
      canonicalEntityKind: "ad",
    });
    expect(resolveCm360DispatchedCapability("ad", { active: true })).toEqual({
      operation: "resume",
      canonicalEntityKind: "ad",
    });
  });

  it("maps an archived flip to update_status", () => {
    expect(resolveCm360DispatchedCapability("campaign", { archived: true })).toEqual({
      operation: "update_status",
      canonicalEntityKind: "campaign",
    });
  });

  it("falls back to update for a non-status patch", () => {
    expect(resolveCm360DispatchedCapability("campaign", { name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "campaign",
    });
  });

  it("resolves canonicalEntityKind to unknown for an out-of-scope type", () => {
    expect(resolveCm360DispatchedCapability("placement", { name: "x" })).toEqual({
      operation: "update",
      canonicalEntityKind: "placement",
    });
  });
});

describe("applyCm360Patch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applyCm360Patch("ad", "ad_1", adEntity(), { active: false });
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Ad");
  });
});

describe("buildCm360Snapshot / snapshotFromCm360Entity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildCm360Snapshot("placement", "pl_1", {}, {})).toBeNull();
  });

  it("snapshotFromCm360Entity returns undefined for an empty entity", () => {
    expect(snapshotFromCm360Entity("ad", "ad_1", {})).toBeUndefined();
  });

  it("snapshotFromCm360Entity normalizes the entity a PUT returns", () => {
    const snapshot = snapshotFromCm360Entity(
      "campaign",
      "camp_1",
      campaignEntity({ archived: true })
    );
    expect(snapshot!.status.canonical).toBe("archived");
    expect(snapshot!.schedule).toEqual({ startAt: "2026-01-01", endAt: "2026-12-31" });
  });
});

describe("captureCm360Snapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureCm360Snapshot(fakeService(adEntity()), "ad", "p_1", "ad_1", ctx);
    expect(snapshot!.entityKind).toBe("ad");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureCm360Snapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "campaign",
      "p_1",
      "camp_1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
