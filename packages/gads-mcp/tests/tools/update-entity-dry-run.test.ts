// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * R2-U3 unit coverage: the Google Ads dry-run path (native `validateOnly` +
 * symbolic apply) and the before/after snapshot normalizer.
 */

import { describe, expect, it } from "vitest";
import type { RequestContext } from "@cesteral/shared";
import {
  runGAdsUpdateDryRun,
  applyGAdsPatch,
  type GAdsDryRunServiceLike,
} from "../../src/mcp-server/tools/utils/dry-run.js";
import {
  buildGAdsSnapshot,
  captureGAdsSnapshot,
  unwrapResource,
} from "../../src/mcp-server/tools/utils/capture-snapshot.js";

const ctx = {} as RequestContext;

/** A `googleAds:search` result row for a campaign (camelCase, as the live API returns it). */
function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    campaign: {
      id: "222",
      name: "Sample Campaign",
      status: "ENABLED",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      ...overrides,
    },
  };
}

function budgetRow(overrides: Record<string, unknown> = {}) {
  return {
    campaignBudget: {
      id: "999",
      name: "Sample Budget",
      amountMicros: "50000000",
      status: "ENABLED",
      ...overrides,
    },
  };
}

/** Fake GAdsService surface for the dry-run helper. */
function fakeService(opts: {
  valid?: boolean;
  errors?: string[];
  row?: Record<string, unknown>;
  validateThrows?: boolean;
}): GAdsDryRunServiceLike {
  return {
    validateEntity: async () => {
      if (opts.validateThrows) throw new Error("network down");
      return { valid: opts.valid ?? true, errors: opts.errors };
    },
    getEntity: async () => opts.row ?? campaignRow(),
  };
}

describe("runGAdsUpdateDryRun", () => {
  it("returns a native-validated, symbolically-applied DryRunResult for a valid pause", async () => {
    const result = await runGAdsUpdateDryRun(
      {
        entityType: "campaign",
        customerId: "111",
        entityId: "222",
        data: { status: "PAUSED" },
        updateMask: "status",
      },
      fakeService({ valid: true }),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.validationErrors).toEqual([]);
    // Native Google Ads validateOnly — non-"none" per the R2-U3 contract.
    expect(result.validationSource).toBe("native_validator");
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.expectedPostState).toBeDefined();
    expect(result.expectedPostState!.platform).toBe("google_ads");
    expect(result.expectedPostState!.entityKind).toBe("campaign");
    expect(result.expectedPostState!.platformEntityId).toBe("222");
    expect(result.expectedPostState!.accountId).toBe("111");
    expect(result.expectedPostState!.status).toEqual({
      canonical: "paused",
      platformRaw: "PAUSED",
    });
  });

  it("maps native validation failures into validationErrors", async () => {
    const result = await runGAdsUpdateDryRun(
      {
        entityType: "campaign",
        customerId: "111",
        entityId: "222",
        data: { status: "BOGUS" },
        updateMask: "status",
      },
      fakeService({ valid: false, errors: ["status BOGUS is not a valid enum value"] }),
      ctx
    );

    expect(result.wouldSucceed).toBe(false);
    expect(result.validationSource).toBe("native_validator");
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0].code).toBe("GOOGLE_ADS_VALIDATION");
    expect(result.validationErrors[0].message).toContain("BOGUS");
    // Symbolic apply still runs — expected state is independent of validity.
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
  });

  it("symbolically applies a budget change on campaignBudget (micros → minor units)", async () => {
    const result = await runGAdsUpdateDryRun(
      {
        entityType: "campaignBudget",
        customerId: "111",
        entityId: "999",
        data: { amountMicros: "75000000" },
        updateMask: "amountMicros",
      },
      fakeService({ valid: true, row: budgetRow() }),
      ctx
    );

    expect(result.wouldSucceed).toBe(true);
    expect(result.expectedPostState!.entityKind).toBe("campaign_budget");
    // 75,000,000 micros / 10,000 = 7,500 minor units ($75.00).
    expect(result.expectedPostState!.budget.daily).toEqual({
      amountMinor: 7500,
      currency: "USD",
    });
  });

  it("reports validation unavailable (source none) when the native call throws", async () => {
    const result = await runGAdsUpdateDryRun(
      {
        entityType: "campaign",
        customerId: "111",
        entityId: "222",
        data: { status: "PAUSED" },
        updateMask: "status",
      },
      fakeService({ validateThrows: true }),
      ctx
    );

    expect(result.validationSource).toBe("none");
    expect(result.wouldSucceed).toBe(false);
    expect(result.validationErrors[0].code).toBe("VALIDATION_UNAVAILABLE");
    // The read still succeeds, so the expected post-state is still produced.
    expect(result.expectedStateSource).toBe("server_symbolic_apply");
  });
});

describe("applyGAdsPatch", () => {
  it("overlays only the masked fields", () => {
    const snapshot = applyGAdsPatch(
      "campaign",
      "111",
      "222",
      { id: "222", name: "Sample Campaign", status: "PAUSED" },
      { status: "ENABLED", name: "Ignored — not in mask" },
      "status"
    );
    expect(snapshot!.status.canonical).toBe("active");
    expect(snapshot!.displayName).toBe("Sample Campaign");
  });
});

describe("buildGAdsSnapshot", () => {
  it("returns null for an out-of-scope entity type", () => {
    expect(buildGAdsSnapshot("keyword", "111", "1~2", {})).toBeNull();
  });

  it("leaves budget null for campaign / adGroup (no budget field on the entity)", () => {
    const snapshot = buildGAdsSnapshot("adGroup", "111", "333", {
      name: "AG",
      status: "ENABLED",
    });
    expect(snapshot!.entityKind).toBe("ad_group");
    expect(snapshot!.budget).toEqual({ daily: null, lifetime: null });
  });
});

describe("unwrapResource / captureGAdsSnapshot", () => {
  it("un-nests the resource from a search row, tolerating snake_case keys", () => {
    expect(unwrapResource("adGroup", { ad_group: { id: "333", status: "ENABLED" } })).toEqual({
      id: "333",
      status: "ENABLED",
    });
  });

  it("normalizes a captured row into the canonical snapshot", async () => {
    const snapshot = await captureGAdsSnapshot(
      { getEntity: async () => campaignRow({ status: "PAUSED" }) },
      "campaign",
      "111",
      "222",
      ctx
    );
    expect(snapshot!.status.canonical).toBe("paused");
    expect(snapshot!.schedule).toEqual({ startAt: "2026-01-01", endAt: "2026-12-31" });
  });

  it("returns undefined (best-effort) when the read throws", async () => {
    const snapshot = await captureGAdsSnapshot(
      {
        getEntity: async () => {
          throw new Error("not found");
        },
      },
      "campaign",
      "111",
      "222",
      ctx
    );
    expect(snapshot).toBeUndefined();
  });
});
