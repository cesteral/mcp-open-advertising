// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R2-U4 unit coverage: the Amazon DSP dry-run path (symbolic validate +
 * symbolic apply) and the before/after snapshot normalizer, over Unified API
 * entity shapes (#234).
 *
 * basis: unified-api-dsp.json `DSPCampaign`, `DSPAdGroup`, `DSPBudget`,
 * `DSPUpdateState` (ENABLED | PAUSED) — amzn/ads-advanced-tools-docs @
 * e25aace0ec07997c113dac48f333298472243558.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runAmazonDspUpdateDryRun,
  applyAmazonDspPatch,
  resolveAmazonDspDispatchedCapability,
  symbolicValidateUpdate,
  type AmazonDspServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildAmazonDspSnapshot,
  captureAmazonDspSnapshot,
  snapshotFromAmazonDspEntity,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;
const ACCOUNT = "adv_1";

function budget(value: number, recurrenceTimePeriod: string, currencyCode?: string) {
  return {
    budgetType: "MONETARY",
    budgetValue: {
      monetaryBudgetValue: {
        monetaryBudget: currencyCode ? { value, currencyCode } : { value },
      },
    },
    recurrenceTimePeriod,
  };
}

function campaignEntity(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: "cmp_1",
    adProduct: "AMAZON_DSP",
    name: "Sample Order",
    state: "ENABLED",
    budgets: [budget(50000, "LIFETIME", "EUR")],
    flights: [
      {
        flightId: "fl_1",
        startDateTime: "2026-01-01T00:00:00Z",
        endDateTime: "2026-12-31T00:00:00Z",
        budget: {
          budgetType: "MONETARY",
          budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 50000 } } },
        },
      },
    ],
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T00:00:00Z",
    ...overrides,
  };
}

function adGroupEntity(overrides: Record<string, unknown> = {}) {
  return {
    adGroupId: "adg_1",
    campaignId: "cmp_1",
    name: "Sample Line Item",
    state: "ENABLED",
    bid: { baseBid: 1.5, currencyCode: "USD" },
    budgets: [budget(500, "DAILY", "USD")],
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-06-30T00:00:00Z",
    ...overrides,
  };
}

function fakeService(entity: Record<string, unknown>): AmazonDspServiceLike {
  return { getEntity: async () => entity };
}

describe("runAmazonDspUpdateDryRun", () => {
  it("symbolically validates + applies a valid pause on an order", async () => {
    const result = await runAmazonDspUpdateDryRun(
      { entityType: "order", accountId: ACCOUNT, entityId: "cmp_1", data: { state: "PAUSED" } },
      fakeService(campaignEntity()),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    expect(result.validationSource).toBe("symbolic");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState!.platform).toBe("amazon_dsp");
    expect(result.expectedPostState!.entityKind).toBe("order");
    expect(result.expectedPostState!.platformEntityId).toBe("cmp_1");
    // Unified entities carry no advertiser field — the snapshot's account is the header value.
    expect(result.expectedPostState!.accountId).toBe(ACCOUNT);
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "PAUSED",
    });
  });

  it("rejects ARCHIVED — not a DSPUpdateState — and points at delete_entity", async () => {
    const result = await runAmazonDspUpdateDryRun(
      {
        entityType: "order",
        accountId: ACCOUNT,
        entityId: "cmp_1",
        data: { state: "ARCHIVED" },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATE");
    expect(result.validationErrors[0].message).toContain("amazon_dsp_delete_entity");
  });

  it("rejects an invalid state value", async () => {
    const result = await runAmazonDspUpdateDryRun(
      { entityType: "order", accountId: ACCOUNT, entityId: "cmp_1", data: { state: "BOGUS" } },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_STATE");
  });

  it("rejects a negative Unified budget value", async () => {
    const result = await runAmazonDspUpdateDryRun(
      {
        entityType: "order",
        accountId: ACCOUNT,
        entityId: "cmp_1",
        data: { budgets: [budget(-10, "DAILY")] },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("INVALID_BUDGET");
  });

  it("refuses a legacy budget it cannot map (no DAILY/LIFETIME type)", async () => {
    const result = await runAmazonDspUpdateDryRun(
      { entityType: "order", accountId: ACCOUNT, entityId: "cmp_1", data: { budget: 75000 } },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("LEGACY_BUDGET_UNMAPPABLE");
  });

  it("symbolically applies a Unified lifetime budget (major → minor, entity currency)", async () => {
    const result = await runAmazonDspUpdateDryRun(
      {
        entityType: "order",
        accountId: ACCOUNT,
        entityId: "cmp_1",
        data: { budgets: [budget(75000, "LIFETIME")] },
      },
      fakeService(campaignEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
    // The patch carries value only (DSPCreateMonetaryBudget); currency comes from the entity.
    expect(result.expectedPostState!.budget.lifetime).toEqual({
      amountMinor: 7_500_000,
      currency: "EUR",
    });
    expect(result.expectedPostState!.budget.daily).toBeNull();
  });

  it("maps a legacy line-item budget { budgetType: DAILY, budget } onto budgets[]", async () => {
    const result = await runAmazonDspUpdateDryRun(
      {
        entityType: "lineItem",
        accountId: ACCOUNT,
        entityId: "adg_1",
        data: { budget: { budgetType: "DAILY", budget: 1000 } },
      },
      fakeService(adGroupEntity()),
      ctx
    );
    expect(result.wouldSucceed).toBe(true);
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
        { entityType: "order", accountId: ACCOUNT, entityId: "cmp_1", data: { state: "PAUSED" } },
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

describe("symbolicValidateUpdate", () => {
  it("refuses an advertiserId naming another account", () => {
    const errors = symbolicValidateUpdate("order", "cmp_1", { advertiserId: "other" }, ACCOUNT);
    expect(errors.map((e) => e.code)).toContain("ACCOUNT_MISMATCH");
  });

  it("refuses legacy fields with no mechanical mapping", () => {
    const errors = symbolicValidateUpdate(
      "lineItem",
      "adg_1",
      { bidding: { bidAmount: 2 } },
      ACCOUNT
    );
    expect(errors[0].code).toBe("LEGACY_FIELD");
    expect(errors[0].message).toContain("bid");
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

  it("maps a budget change (Unified or legacy key) to update_budget", () => {
    expect(
      resolveAmazonDspDispatchedCapability("order", { budgets: [budget(1, "DAILY")] })
    ).toEqual({ operation: "update_budget", canonicalEntityKind: "order" });
    expect(
      resolveAmazonDspDispatchedCapability("lineItem", {
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
    const snapshot = applyAmazonDspPatch(
      "order",
      "cmp_1",
      campaignEntity(),
      { state: "PAUSED" },
      ACCOUNT
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.displayName).toBe("Sample Order");
    expect(snapshot!.accountId).toBe(ACCOUNT);
  });
});

describe("buildAmazonDspSnapshot / snapshotFromAmazonDspEntity", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildAmazonDspSnapshot("creative", "ad_1", {}, {})).toBeNull();
  });

  it("snapshotFromAmazonDspEntity returns undefined for an empty entity", () => {
    expect(snapshotFromAmazonDspEntity("order", "cmp_1", {})).toBeUndefined();
  });

  it("takes a campaign's schedule from its flights", () => {
    const snapshot = snapshotFromAmazonDspEntity(
      "order",
      "cmp_1",
      campaignEntity({
        state: "PAUSED",
        startDateTime: undefined,
        endDateTime: undefined,
        flights: [
          { startDateTime: "2026-03-01T00:00:00Z", endDateTime: "2026-03-31T00:00:00Z" },
          { startDateTime: "2026-02-01T00:00:00Z", endDateTime: "2026-02-28T00:00:00Z" },
        ],
      }),
      ACCOUNT
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.schedule).toEqual({
      startAt: "2026-02-01T00:00:00Z",
      endAt: "2026-03-31T00:00:00Z",
    });
  });

  it("ignores MONTHLY budgets (no canonical slot)", () => {
    const snapshot = snapshotFromAmazonDspEntity(
      "lineItem",
      "adg_1",
      adGroupEntity({ budgets: [budget(9, "MONTHLY", "USD")] })
    );
    expect(snapshot!.budget).toEqual({ daily: null, lifetime: null });
  });
});

describe("captureAmazonDspSnapshot", () => {
  it("normalizes a captured entity", async () => {
    const snapshot = await captureAmazonDspSnapshot(
      fakeService(adGroupEntity()),
      "lineItem",
      ACCOUNT,
      "adg_1",
      ctx
    );
    expect(snapshot!.entityKind).toBe("line_item");
    expect(snapshot!.status.canonical).toBe("active");
    expect(snapshot!.budget.daily).toEqual({ amountMinor: 50_000, currency: "USD" });
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureAmazonDspSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "order",
      ACCOUNT,
      "cmp_1",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
