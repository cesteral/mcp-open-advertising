// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R2-U4 unit coverage: the Amazon DSP dry-run path (symbolic validate +
 * symbolic apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runAmazonDspUpdateDryRun,
  applyAmazonDspPatch,
  resolveAmazonDspDispatchedCapability,
  type AmazonDspServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildAmazonDspSnapshot,
  captureAmazonDspSnapshot,
  snapshotFromAmazonDspEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

function orderEntity(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "ord_1",
    name: "Sample Order",
    state: "ENABLED",
    advertiserId: "adv_1",
    budget: 50000,
    budgetType: "LIFETIME",
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T00:00:00Z",
    ...overrides,
  };
}

function lineItemEntity(overrides: Record<string, unknown> = {}) {
  return {
    lineItemId: "li_1",
    name: "Sample Line Item",
    state: "ENABLED",
    orderId: "ord_1",
    advertiserId: "adv_1",
    budget: { budgetType: "DAILY", budget: 500 },
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): AmazonDspServiceLike {
  return { getEntity: async () => entity };
}

describe("runAmazonDspUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on an order", async () => {
    const result = await runAmazonDspUpdateDryRun(
      { entityType: "order", entityId: "ord_1", data: { state: "PAUSED" } },
      fakeService(orderEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // No native validate/preview on Amazon DSP — symbolic, but non-"none".
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("amazon_dsp");
    expect(result.expectedPostState!.entityKind).toBe("order");
    expect(result.expectedPostState!.platformEntityId).toBe("ord_1");
    expect(result.expectedPostState!.accountId).toBe("adv_1");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "PAUSED",
    });
  });

  it("rejects an invalid state value", async () => {
    const result = await runAmazonDspUpdateDryRun(
      { entityType: "order", entityId: "ord_1", data: { state: "BOGUS" } },
      fakeService(orderEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATE");
  });

  it("rejects a negative budget", async () => {
    const result = await runAmazonDspUpdateDryRun(
      { entityType: "order", entityId: "ord_1", data: { budget: -10 } },
      fakeService(orderEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("symbolically applies an order budget change (major → minor units)", async () => {
    const result = await runAmazonDspUpdateDryRun(
      { entityType: "order", entityId: "ord_1", data: { budget: 75000 } },
      fakeService(orderEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // 75,000 major units × 100 = 7,500,000 minor units; budgetType LIFETIME.
    expect(result.expectedPostState!.budget.lifetime).toEqual({
      amountMinor: 7_500_000,
      currency: "USD",
    });
    expect(result.expectedPostState!.budget.daily).toBeNull();
  });

  it("normalizes a line item's nested daily budget", async () => {
    const result = await runAmazonDspUpdateDryRun(
      {
        entityType: "lineItem",
        entityId: "li_1",
        data: { budget: { budgetType: "DAILY", budget: 1000 } },
      },
      fakeService(lineItemEntity()),
      ctx
    );
    expect(result.expectedPostState!.entityKind).toBe("line_item");
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 100_000,
      currency: "USD",
    });
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    await expect(
      runAmazonDspUpdateDryRun(
        { entityType: "order", entityId: "ord_1", data: { state: "PAUSED" } },
        {
          getEntity: async () => {
            throw new Error("order not found");
          },
        },
        ctx
      )
    ).rejects.toThrow(/order not found/);
  });
});

describe("resolveAmazonDspDispatchedCapability", () => {
  it("maps state transitions to pause / resume / update_status", () => {
    expect(resolveAmazonDspDispatchedCapability("order", { state: "PAUSED" })).toEqual({
      operation: "pause",
      canonicalEntityKind: "order",
    });
    expect(resolveAmazonDspDispatchedCapability("lineItem", { state: "ENABLED" })).toEqual({
      operation: "resume",
      canonicalEntityKind: "line_item",
    });
    expect(resolveAmazonDspDispatchedCapability("order", { state: "ARCHIVED" })).toEqual({
      operation: "update_status",
      canonicalEntityKind: "order",
    });
  });

  it("maps a budget change to update_budget and resolves the campaign/adGroup aliases", () => {
    expect(resolveAmazonDspDispatchedCapability("campaign", { budget: 50000 })).toEqual({
      operation: "update_budget",
      canonicalEntityKind: "order",
    });
    expect(
      resolveAmazonDspDispatchedCapability("adGroup", {
        budget: { budgetType: "DAILY", budget: 100 },
      })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "line_item" });
  });

  it("falls back to update for a non-state, non-budget patch", () => {
    expect(resolveAmazonDspDispatchedCapability("order", { name: "Renamed" })).toEqual({
      operation: "update",
      canonicalEntityKind: "order",
    });
  });
});

describe("applyAmazonDspPatch", () => {
  it("shallow-merges the patch over pre-state", () => {
    const snapshot = applyAmazonDspPatch("order", "ord_1", orderEntity(), { state: "PAUSED" });
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Order");
  });
});

describe("buildAmazonDspSnapshot / snapshotFromAmazonDspEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildAmazonDspSnapshot("creative", "cr_1", {}, {})).toBeNull();
  });

  it("snapshotFromAmazonDspEntity returns undefined for an empty entity", () => {
    expect(snapshotFromAmazonDspEntity("order", "ord_1", {})).toBeUndefined();
  });

  it("snapshotFromAmazonDspEntity normalizes the entity a PUT returns", () => {
    const snapshot = snapshotFromAmazonDspEntity(
      "order",
      "ord_1",
      orderEntity({ state: "PAUSED" })
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.schedule).toEqual({
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-12-31T00:00:00Z",
    });
  });
});

describe("captureAmazonDspSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureAmazonDspSnapshot(
      fakeService(lineItemEntity()),
      "lineItem",
      "li_1",
      ctx
    );
    expect(snapshot!.entityKind).toBe("line_item");
    expect(snapshot!.status.canonical).toBe("active");
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureAmazonDspSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "order",
      "ord_1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
