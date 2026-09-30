// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * amazon_dsp_create_entity over the Unified API (#234). The service is mocked
 * here; the request that actually leaves the process is asserted in
 * amazon-dsp-unified-wire.test.ts.
 *
 * basis: unified-api-dsp.json DSPCampaignCreate / DSPAdGroupCreate /
 * DSPAdCreate / DSPCreateState — amzn/ads-advanced-tools-docs @
 * e25aace0ec07997c113dac48f333298472243558.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  createEntityLogic,
  createEntityResponseFormatter,
  CreateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

const mockCreateEntity = vi.fn();
const ACCOUNT = "5550001112223";

const campaignData = {
  name: "Test Order",
  flights: [
    {
      startDateTime: "2026-07-01T00:00:00Z",
      endDateTime: "2026-07-31T23:59:59Z",
      budget: {
        budgetType: "MONETARY",
        budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 40000 } } },
      },
    },
  ],
  budgets: [
    {
      budgetType: "MONETARY",
      budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 40000 } } },
      recurrenceTimePeriod: "LIFETIME",
    },
  ],
  optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
};

beforeEach(() => {
  mockCreateEntity.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspService: {
      createEntity: mockCreateEntity,
    },
    boundProfileId: "1234567890",
  } as any);
});

describe("amazonDsp_create_entity tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("createEntityLogic()", () => {
    it("creates an order, passing accountId and the caller's data to the service", async () => {
      mockCreateEntity.mockResolvedValueOnce({ campaignId: "cmp_999", name: "Test Order" });

      const result = await createEntityLogic(
        {
          entityType: "order",
          profileId: "1234567890",
          accountId: ACCOUNT,
          data: campaignData,
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entityType).toBe("order");
      expect(result.entity).toEqual({ campaignId: "cmp_999", name: "Test Order" });
      expect(mockCreateEntity).toHaveBeenCalledWith("order", ACCOUNT, campaignData, baseContext);
    });

    it("creates a creative (Unified ad) — creatable since #234", async () => {
      mockCreateEntity.mockResolvedValueOnce({ adId: "ad_1" });
      const result = await createEntityLogic(
        {
          entityType: "creative",
          profileId: "1234567890",
          accountId: ACCOUNT,
          data: {
            name: "Ad",
            adType: "COMPONENT",
            state: "PAUSED",
            creative: { componentCreative: {} },
          },
        },
        baseContext,
        baseSdkContext
      );
      expect(result.entity).toEqual({ adId: "ad_1" });
      expect(result.dispatchedCapability).toEqual({
        operation: "create",
        canonicalEntityKind: null,
      });
    });

    it("refuses a campaign created in any state but PAUSED before calling the service", async () => {
      await expect(
        createEntityLogic(
          {
            entityType: "order",
            profileId: "1234567890",
            accountId: ACCOUNT,
            data: { ...campaignData, state: "ENABLED" },
          },
          baseContext,
          baseSdkContext
        )
      ).rejects.toThrow(/PAUSED/);
      expect(mockCreateEntity).not.toHaveBeenCalled();
    });

    it("refuses an advertiserId that names another account", async () => {
      await expect(
        createEntityLogic(
          {
            entityType: "order",
            profileId: "1234567890",
            accountId: ACCOUNT,
            data: { ...campaignData, advertiserId: "someone-else" },
          },
          baseContext,
          baseSdkContext
        )
      ).rejects.toThrow(/different account/);
      expect(mockCreateEntity).not.toHaveBeenCalled();
    });

    it("propagates errors from the service", async () => {
      mockCreateEntity.mockRejectedValueOnce(new Error("Amazon DSP rejected the create"));

      await expect(
        createEntityLogic(
          {
            entityType: "order",
            profileId: "1234567890",
            accountId: ACCOUNT,
            data: { name: "Bad Order" },
          },
          baseContext,
          baseSdkContext
        )
      ).rejects.toThrow("Amazon DSP rejected the create");
    });
  });

  describe("createEntityResponseFormatter()", () => {
    it("formats create result with entity type", () => {
      const result = {
        entity: { campaignId: "cmp_999", name: "Test" },
        entityType: "order",
        timestamp: "2026-03-04T00:00:00.000Z",
        dispatchedCapability: { operation: "create", canonicalEntityKind: "order" },
      };

      const formatted = createEntityResponseFormatter(result);
      expect(formatted).toHaveLength(1);
      expect((formatted[0] as any).type).toBe("text");
      expect((formatted[0] as any).text).toContain("order created successfully");
    });
  });

  describe("input schema validation", () => {
    it("accepts a valid order creation payload", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
        accountId: ACCOUNT,
        data: campaignData,
      });
      expect(result.success).toBe(true);
    });

    it("requires accountId (the Amazon-Ads-AccountId header)", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
        data: campaignData,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-object data payload", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
        accountId: ACCOUNT,
        data: "not-an-object",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an invalid entity type", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "invalidType",
        profileId: "1234567890",
        accountId: ACCOUNT,
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it("accepts every Unified-creatable entity type", () => {
      for (const entityType of ["order", "lineItem", "creative", "target", "creativeAssociation"]) {
        expect(
          CreateEntityInputSchema.safeParse({
            entityType,
            profileId: "1",
            accountId: ACCOUNT,
            data: { name: "x" },
          }).success,
          entityType
        ).toBe(true);
      }
    });
  });
});

describe("amazon_dsp_create_entity governance contract", () => {
  const ctx = { requestId: "r" } as any;
  const sdk = { sessionId: "s" } as any;
  beforeEach(() => {
    mockCreateEntity
      .mockReset()
      .mockResolvedValue({ campaignId: "cmp_999", name: "New Order", state: "PAUSED" });
    mockResolveSession.mockReturnValue({
      amazonDspService: { createEntity: mockCreateEntity },
      boundProfileId: "1",
    } as any);
  });

  it("dry_run returns a symbolic post-state (state PAUSED added) and does not create", async () => {
    const result = await createEntityLogic(
      {
        entityType: "order",
        profileId: "1",
        accountId: ACCOUNT,
        data: { ...campaignData, name: "New Order" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockCreateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
    expect(result.dryRun?.expectedPostState?.accountId).toBe(ACCOUNT);
    expect(result.dryRun?.expectedPostState?.budget.lifetime?.amountMinor).toBe(4_000_000);
    expect(result.dryRun?.expectedPostState?.schedule).toEqual({
      startAt: "2026-07-01T00:00:00Z",
      endAt: "2026-07-31T23:59:59Z",
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "create",
      canonicalEntityKind: "order",
    });
  });

  it("dry_run maps a legacy DAILY line-item budget and orderId", async () => {
    const result = await createEntityLogic(
      {
        entityType: "lineItem",
        profileId: "1",
        accountId: ACCOUNT,
        data: {
          name: "LI",
          orderId: "cmp_1",
          budget: { budgetType: "DAILY", budget: 20 },
        },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.expectedPostState?.budget.daily).toEqual({
      amountMinor: 2_000,
      currency: "USD",
    });
  });

  it("execute normalizes the created entity into the after snapshot (no before)", async () => {
    const result = await createEntityLogic(
      {
        entityType: "order",
        profileId: "1",
        accountId: ACCOUNT,
        data: { name: "New Order" },
      } as any,
      ctx,
      sdk
    );
    expect(mockCreateEntity).toHaveBeenCalledOnce();
    expect(result.after?.status.canonical).toBe("paused");
    expect(result.after?.platformEntityId).toBe("cmp_999");
    expect(result.after?.accountId).toBe(ACCOUNT);
    expect((result as any).before).toBeUndefined();
  });

  it("out-of-scope kind resolves canonicalEntityKind:null", async () => {
    mockCreateEntity.mockResolvedValue({ targetId: "t_1" });
    const result = await createEntityLogic(
      {
        entityType: "target",
        profileId: "1",
        accountId: ACCOUNT,
        data: { adGroupId: "adg_1" },
      } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(result.after).toBeUndefined();
  });

  it("out-of-scope dry_run does not throw and emits no snapshot", async () => {
    mockCreateEntity.mockClear();
    const result = await createEntityLogic(
      { entityType: "target", profileId: "1", accountId: ACCOUNT, data: {}, dry_run: true } as any,
      ctx,
      sdk
    );
    expect(mockCreateEntity).not.toHaveBeenCalled();
    expect(result.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun?.expectedPostState).toBeUndefined();
    expect(result.dryRun?.expectedStateSource).toBe("none");
  });
});

describe("bulk create input schema", () => {
  it("amazon_dsp_bulk_create_entities accepts creative (Unified ad) and target", async () => {
    const { BulkCreateEntitiesInputSchema } = await import(
      "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js"
    );
    for (const entityType of ["creative", "target"]) {
      expect(
        BulkCreateEntitiesInputSchema.safeParse({
          entityType,
          profileId: "1",
          accountId: ACCOUNT,
          items: [{ name: "x" }],
        }).success
      ).toBe(true);
    }
  });
});
