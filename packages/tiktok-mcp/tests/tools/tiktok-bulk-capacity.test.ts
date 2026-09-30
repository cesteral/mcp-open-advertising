// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check: with the package's REAL default limiter
 * (`utils/platform.ts`, 10/min, queue budget 120s), a batch whose last request
 * would queue past the budget is refused with `RateLimited` before any
 * confirmation prompt and before any upstream HTTP call; a batch that fits
 * proceeds; the dry-run predicts the refusal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockElicitStatus, mockElicitMutation, mockElicitBid } =
  vi.hoisted(() => ({
    mockResolveSessionServices: vi.fn(),
    mockElicitStatus: vi.fn(),
    mockElicitMutation: vi.fn(),
    mockElicitBid: vi.fn(),
  }));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBulkStatusChangeConfirmation: mockElicitStatus,
    elicitBulkMutationConfirmation: mockElicitMutation,
    elicitBidChangeConfirmation: mockElicitBid,
  };
});

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import { rateLimiter } from "../../src/utils/platform.js";
import { TikTokService } from "../../src/services/tiktok/tiktok-service.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
const ADVERTISER = "1234567890";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `18001111111${i}`);

let http: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

async function expectRefused(promise: Promise<unknown>, itemCount: number, itemsThatFit: number) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(McpError);
  expect((error as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
  expect((error as McpError).data).toMatchObject({
    reason: "bulk_exceeds_capacity",
    itemCount,
    itemsThatFit,
    budgetMs: 120_000,
  });
  expect(http.get).not.toHaveBeenCalled();
  expect(http.post).not.toHaveBeenCalled();
  expect(mockElicitStatus).not.toHaveBeenCalled();
  expect(mockElicitMutation).not.toHaveBeenCalled();
  expect(mockElicitBid).not.toHaveBeenCalled();
}

describe("tiktok bulk capacity pre-check (real default limiter: 10/min, 120s budget)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.clear();
    http = {
      get: vi.fn().mockResolvedValue({ list: [{ adgroup_id: "x", bid_price: 1.5 }] }),
      post: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({
      tiktokService: new TikTokService(rateLimiter, http as any, logger),
      boundAdvertiserId: ADVERTISER,
    });
    mockElicitStatus.mockResolvedValue(true);
    mockElicitMutation.mockResolvedValue(true);
    mockElicitBid.mockResolvedValue(true);
  });

  it("the package limiter is the default 10/min with a 120s queue budget", () => {
    expect(rateLimiter.describeLimits()).toEqual([
      { pattern: "tiktok:*", limit: 10, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  describe("tiktok_bulk_update_entities (3 tokens/item on tiktok:default)", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType: "campaign",
        advertiserId: ADVERTISER,
        items: ids(n).map((entityId) => ({ entityId, data: { budget: 100 } })),
        ...extra,
      }) as any;

    it("refuses a 50-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(bulkUpdateEntitiesLogic(input(50), ctx, sdk), 50, 9);
    });

    it("counts tokens already consumed in the window", async () => {
      await rateLimiter.consume("tiktok:default", 10);
      await expectRefused(bulkUpdateEntitiesLogic(input(9), ctx, sdk), 9, 6);
    });

    it("a batch that fits proceeds", async () => {
      const result = await bulkUpdateEntitiesLogic(input(3), ctx, sdk);
      expect(mockElicitMutation).toHaveBeenCalledOnce();
      expect(http.post).toHaveBeenCalledTimes(3);
      expect(result.successCount).toBe(3);
    });

    it("dry-run predicts the refusal", async () => {
      const refused = await bulkUpdateEntitiesLogic(input(50, { dry_run: true }), ctx, sdk);
      expect(refused.dryRun?.wouldSucceed).toBe(false);
      expect(refused.dryRun?.validationErrors[0]).toMatchObject({
        code: "BULK_EXCEEDS_CAPACITY",
        field: "items",
      });
      expect(refused.dryRun?.validationErrors[0]?.message).toContain("9 item(s) fit");
      const fits = await bulkUpdateEntitiesLogic(input(3, { dry_run: true }), ctx, sdk);
      expect(fits.dryRun?.wouldSucceed).toBe(true);
      expect(http.post).not.toHaveBeenCalled();
    });
  });

  describe("tiktok_bulk_create_entities (3 tokens/item on tiktok:default)", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType: "campaign",
        advertiserId: ADVERTISER,
        items: Array.from({ length: n }, (_, i) => ({ campaign_name: `c${i}` })),
        ...extra,
      }) as any;

    it("refuses a 50-item batch before any HTTP call", async () => {
      await expectRefused(bulkCreateEntitiesLogic(input(50), ctx, sdk), 50, 9);
    });

    it("a batch that fits proceeds", async () => {
      const result = await bulkCreateEntitiesLogic(input(3), ctx, sdk);
      expect(http.post).toHaveBeenCalledTimes(3);
      expect(result.successCount).toBe(3);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await bulkCreateEntitiesLogic(input(50, { dry_run: true }), ctx, sdk);
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("BULK_EXCEEDS_CAPACITY");
    });
  });

  describe("tiktok_adjust_bids (read 1 + write 3 per ad group on tiktok:default)", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        advertiserId: ADVERTISER,
        adjustments: ids(n).map((adGroupId) => ({ adGroupId, bidPrice: 2 })),
        ...extra,
      }) as any;

    it("refuses a 50-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(adjustBidsLogic(input(50), ctx, sdk), 50, 6);
    });

    it("a batch that fits proceeds", async () => {
      const result = await adjustBidsLogic(input(2), ctx, sdk);
      expect(mockElicitBid).toHaveBeenCalledOnce();
      expect(http.get).toHaveBeenCalledTimes(2);
      expect(http.post).toHaveBeenCalledTimes(2);
      expect(result.totalSucceeded).toBe(2);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await adjustBidsLogic(input(50, { dry_run: true }), ctx, sdk);
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]).toMatchObject({
        code: "BULK_EXCEEDS_CAPACITY",
        field: "adjustments",
      });
    });
  });

  it("tiktok_bulk_update_status needs no pre-check: the whole batch is ONE 3-token request", async () => {
    const result = await bulkUpdateStatusLogic(
      {
        entityType: "campaign",
        advertiserId: ADVERTISER,
        entityIds: ids(20),
        operationStatus: "DISABLE",
      } as any,
      ctx,
      sdk
    );
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(rateLimiter.getRemainingTokens("tiktok:default")).toBe(7);
    expect(result.results).toHaveLength(20);
  });
});
