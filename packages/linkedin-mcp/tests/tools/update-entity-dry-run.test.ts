// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R3-U3 unit coverage: the LinkedIn dry-run path (symbolic validate +
 * symbolic apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runLinkedInUpdateDryRun,
  applyLinkedInPatch,
  resolveLinkedInDispatchedCapability,
  type LinkedInServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildLinkedInSnapshot,
  captureLinkedInSnapshot,
  snapshotFromLinkedInEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

// 2026-01-01T00:00:00.000Z / 2026-12-31T00:00:00.000Z in epoch-millis.
const RUN_START = 1767225600000;
const RUN_END = 1798675200000;

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Sample Campaign",
    status: "ACTIVE",
    account: "urn:li:sponsoredAccount:1",
    dailyBudget: { amount: "50.00", currencyCode: "USD" },
    totalBudget: { amount: "5000.00", currencyCode: "USD" },
    runSchedule: { start: RUN_START, end: RUN_END },
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): LinkedInServiceLike {
  return { getEntity: async () => entity };
}

describe("runLinkedInUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on a campaign", async () => {
    const result = await runLinkedInUpdateDryRun(
      {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:1",
        data: { status: "PAUSED" },
      },
      fakeService(campaignEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on LinkedIn — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("linkedin_ads");
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.platformEntityId).toBe("urn:li:sponsoredCampaign:1");
    expect(result.expectedPostState!.accountId).toBe("urn:li:sponsoredAccount:1");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "PAUSED",
    });
  });

  it("rejects an invalid status value", async () => {
    const result = await runLinkedInUpdateDryRun(
      {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:1",
        data: { status: "BOGUS" },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATUS");
  });

  it("rejects a negative budget", async () => {
    const result = await runLinkedInUpdateDryRun(
      {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:1",
        data: { dailyBudget: { amount: "-10.00", currencyCode: "USD" } },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("symbolically applies a campaign budget change (major → minor units)", async () => {
    const result = await runLinkedInUpdateDryRun(
      {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:1",
        data: { dailyBudget: { amount: "100.00", currencyCode: "USD" } },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // 100.00 major units × 100 = 10,000 minor units.
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 10_000,
      currency: "USD",
    });
    expect(result.expectedPostState!.budget.lifetime).toEqual({
      amountMinor: 500_000,
      currency: "USD",
    });
  });

  it("converts the runSchedule epoch-millis to ISO strings", async () => {
    const result = await runLinkedInUpdateDryRun(
      {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:1",
        data: { status: "PAUSED" },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.expectedPostState!.schedule).toEqual({
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    });
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runLinkedInUpdateDryRun(
        {
          entityType: "campaign",
          entityUrn: "urn:li:sponsoredCampaign:1",
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

describe("resolveLinkedInDispatchedCapability", () => {
  it("maps status transitions to pause / resume / update_status", () => {
    expect(resolveLinkedInDispatchedCapability("campaign", { status: "PAUSED" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "campaign",
    });
    expect(resolveLinkedInDispatchedCapability("campaign", { status: "ACTIVE" })).toEqual({
      operation: "resume",
      canonicalEntityKind: "campaign",
    });
    expect(resolveLinkedInDispatchedCapability("campaign", { status: "ARCHIVED" })).toEqual({
      operation: "update_status",
      canonicalEntityKind: "campaign",
    });
  });

  it("maps a budget change to update_budget", () => {
    expect(
      resolveLinkedInDispatchedCapability("campaign", {
        dailyBudget: { amount: "100.00", currencyCode: "USD" },
      })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "campaign" });
    expect(
      resolveLinkedInDispatchedCapability("campaign", {
        totalBudget: { amount: "5000.00", currencyCode: "USD" },
      })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "campaign" });
  });

  it("falls back to update for a non-status, non-budget patch", () => {
    expect(resolveLinkedInDispatchedCapability("campaign", { name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "campaign",
    });
  });
});

describe("applyLinkedInPatch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applyLinkedInPatch(
      "campaign",
      "urn:li:sponsoredCampaign:1",
      campaignEntity(),
      { status: "PAUSED" }
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Campaign");
  });
});

describe("buildLinkedInSnapshot / snapshotFromLinkedInEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(
      buildLinkedInSnapshot("campaignGroup", "urn:li:sponsoredCampaignGroup:1", {}, {})
    ).toBeNull();
    expect(buildLinkedInSnapshot("creative", "urn:li:sponsoredCreative:1", {}, {})).toBeNull();
  });

  it("snapshotFromLinkedInEntity returns undefined for an empty entity", () => {
    expect(
      snapshotFromLinkedInEntity("campaign", "urn:li:sponsoredCampaign:1", {})
    ).toBeUndefined();
  });

  it("snapshotFromLinkedInEntity normalizes the entity a partial update returns", () => {
    const snapshot = snapshotFromLinkedInEntity(
      "campaign",
      "urn:li:sponsoredCampaign:1",
      campaignEntity({ status: "PAUSED" })
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.schedule).toEqual({
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    });
  });
});

describe("captureLinkedInSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureLinkedInSnapshot(
      fakeService(campaignEntity()),
      "campaign",
      "urn:li:sponsoredCampaign:1",
      ctx
    );
    expect(snapshot!.entityKind).toBe("campaign");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureLinkedInSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "campaign",
      "urn:li:sponsoredCampaign:1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
