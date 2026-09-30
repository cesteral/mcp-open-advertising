// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check (#bulk-capacity): with the package's REAL default
 * limiter (`utils/platform.ts`, 20/min, queue budget 120s), a batch whose last
 * request would queue past the budget is refused with `RateLimited` before any
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
import { MetaService } from "../../src/services/meta/meta-service.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `2345678901234${i}`);

let http: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; delete: any };

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

describe("meta bulk capacity pre-check (real default limiter: 20/min, 120s budget)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.clear();
    http = {
      get: vi.fn().mockResolvedValue({ id: "x", name: "n", bid_amount: 100 }),
      post: vi.fn().mockResolvedValue({ id: "new", success: true }),
      delete: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({
      metaService: new MetaService(rateLimiter, http as any, logger),
    });
    mockElicitStatus.mockResolvedValue(true);
    mockElicitMutation.mockResolvedValue(true);
    mockElicitBid.mockResolvedValue(true);
  });

  it("the package limiter is the default 20/min with a 120s queue budget", () => {
    expect(rateLimiter.describeLimits()).toEqual([
      { pattern: "meta:*", limit: 20, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  describe("meta_bulk_update_status (3 tokens/item on meta:default)", () => {
    it("refuses a 50-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(
        bulkUpdateStatusLogic({ entityIds: ids(50), status: "PAUSED" } as any, ctx, sdk),
        50,
        18
      );
    });

    it("a batch that fits proceeds", async () => {
      const result = await bulkUpdateStatusLogic(
        { entityIds: ids(6), status: "PAUSED" } as any,
        ctx,
        sdk
      );
      expect(mockElicitStatus).toHaveBeenCalledOnce();
      expect(http.post).toHaveBeenCalledTimes(6);
      expect(result.successCount).toBe(6);
    });

    it("counts tokens already consumed in the window", async () => {
      await rateLimiter.consume("meta:default", 20);
      await expectRefused(
        bulkUpdateStatusLogic({ entityIds: ids(18), status: "PAUSED" } as any, ctx, sdk),
        18,
        12
      );
    });

    it("dry-run predicts the refusal", async () => {
      const refused = await bulkUpdateStatusLogic(
        { entityIds: ids(50), status: "PAUSED", dry_run: true } as any,
        ctx,
        sdk
      );
      expect(refused.dryRun?.wouldSucceed).toBe(false);
      expect(refused.dryRun?.validationErrors[0]).toMatchObject({
        code: "BULK_EXCEEDS_CAPACITY",
        field: "entityIds",
      });
      expect(refused.dryRun?.validationErrors[0]?.message).toContain("18 item(s) fit");

      const fits = await bulkUpdateStatusLogic(
        { entityIds: ids(6), status: "PAUSED", dry_run: true } as any,
        ctx,
        sdk
      );
      expect(fits.dryRun?.wouldSucceed).toBe(true);
      expect(http.post).not.toHaveBeenCalled();
    });
  });

  describe("meta_bulk_update_entities (3 tokens/item on meta:default)", () => {
    const items = (n: number) => ids(n).map((entityId) => ({ entityId, data: { name: "x" } }));

    it("refuses a 50-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(bulkUpdateEntitiesLogic({ items: items(50) } as any, ctx, sdk), 50, 18);
    });

    it("a batch that fits proceeds", async () => {
      const result = await bulkUpdateEntitiesLogic({ items: items(5) } as any, ctx, sdk);
      expect(http.post).toHaveBeenCalledTimes(5);
      expect(result.successCount).toBe(5);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await bulkUpdateEntitiesLogic(
        { items: items(50), dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("BULK_EXCEEDS_CAPACITY");
    });
  });

  describe("meta_bulk_create_entities (3 tokens/item on meta:${adAccountId})", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType: "campaign",
        adAccountId: "act_1",
        items: Array.from({ length: n }, (_, i) => ({ name: `c${i}` })),
        ...extra,
      }) as any;

    it("refuses a 50-item batch before any HTTP call", async () => {
      await expectRefused(bulkCreateEntitiesLogic(input(50), ctx, sdk), 50, 18);
    });

    it("is keyed by the account the creates consume from", async () => {
      // Saturating a different key does not constrain this account's batch…
      await rateLimiter.consume("meta:default", 20);
      await expect(bulkCreateEntitiesLogic(input(6), ctx, sdk)).resolves.toMatchObject({
        successCount: 6,
      });
      // …while the same account's window (now 18/20 used) does.
      http.post.mockClear();
      await expectRefused(bulkCreateEntitiesLogic(input(18), ctx, sdk), 18, 12);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await bulkCreateEntitiesLogic(input(50, { dry_run: true }), ctx, sdk);
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("BULK_EXCEEDS_CAPACITY");
    });
  });

  describe("meta_adjust_bids (read 1 + write 3 per ad set on meta:default)", () => {
    const adjustments = (n: number) => ids(n).map((adSetId) => ({ adSetId, bidAmount: 500 }));

    it("refuses a 50-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(
        adjustBidsLogic({ adjustments: adjustments(50) } as any, ctx, sdk),
        50,
        15
      );
    });

    it("a batch that fits proceeds", async () => {
      const result = await adjustBidsLogic({ adjustments: adjustments(5) } as any, ctx, sdk);
      expect(mockElicitBid).toHaveBeenCalledOnce();
      expect(http.get).toHaveBeenCalledTimes(5);
      expect(http.post).toHaveBeenCalledTimes(5);
      expect(result.totalSucceeded).toBe(5);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await adjustBidsLogic(
        { adjustments: adjustments(50), dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]).toMatchObject({
        code: "BULK_EXCEEDS_CAPACITY",
        field: "adjustments",
      });
    });
  });
});
