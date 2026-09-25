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

const {
  mockResolveSessionServices,
  mockElicitStatus,
  mockElicitMutation,
  mockElicitBid,
  mockElicitDelete,
} = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitStatus: vi.fn(),
  mockElicitMutation: vi.fn(),
  mockElicitBid: vi.fn(),
  mockElicitDelete: vi.fn(),
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
    elicitBulkDeleteConfirmation: mockElicitDelete,
  };
});

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import { rateLimiter } from "../../src/utils/platform.js";
import { PinterestService } from "../../src/services/pinterest/pinterest-service.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { deleteEntityLogic } from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
const ACCOUNT = "549755885175";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `68719476${i}`);

let http: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function expectNoUpstreamOrPrompt() {
  expect(http.get).not.toHaveBeenCalled();
  expect(http.post).not.toHaveBeenCalled();
  expect(http.patch).not.toHaveBeenCalled();
  expect(http.delete).not.toHaveBeenCalled();
  expect(mockElicitStatus).not.toHaveBeenCalled();
  expect(mockElicitMutation).not.toHaveBeenCalled();
  expect(mockElicitBid).not.toHaveBeenCalled();
  expect(mockElicitDelete).not.toHaveBeenCalled();
}

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
  expectNoUpstreamOrPrompt();
}

describe("pinterest bulk capacity pre-check (real default limiter: 10/min, 120s budget)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.clear();
    const batchItem = { items: [{ data: { id: "x" }, exceptions: [] }] };
    http = {
      // getEntity requires the returned id to be the one asked for.
      get: vi.fn().mockImplementation(async (path: string) => ({
        id: decodeURIComponent(path.split("/").pop() ?? ""),
        bid_in_micro_currency: 1_000_000,
      })),
      post: vi.fn().mockResolvedValue(batchItem),
      patch: vi.fn().mockResolvedValue(batchItem),
      delete: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({
      pinterestService: new PinterestService(rateLimiter, http as any, logger),
      boundAdAccountId: ACCOUNT,
    });
    for (const m of [mockElicitStatus, mockElicitMutation, mockElicitBid, mockElicitDelete]) {
      m.mockResolvedValue(true);
    }
  });

  it("the package limiter is the default 10/min with a 120s queue budget", () => {
    expect(rateLimiter.describeLimits()).toEqual([
      { pattern: "pinterest:*", limit: 10, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  describe("pinterest_bulk_update_status (3 tokens/item on pinterest:${adAccountId})", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityIds: ids(n),
        operationStatus: "PAUSED",
        ...extra,
      }) as any;

    it("refuses a 20-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(bulkUpdateStatusLogic(input(20), ctx, sdk), 20, 9);
    });

    it("counts tokens already consumed on the same account key only", async () => {
      // A saturated window on another account does not constrain this one…
      await rateLimiter.consume("pinterest:another-account", 10);
      await expect(bulkUpdateStatusLogic(input(3), ctx, sdk)).resolves.toMatchObject({
        successCount: 3,
      });
      // …while this account's own window (now 9/10 used) does.
      vi.clearAllMocks();
      await expectRefused(bulkUpdateStatusLogic(input(9), ctx, sdk), 9, 6);
    });

    it("a batch that fits proceeds", async () => {
      const result = await bulkUpdateStatusLogic(input(3), ctx, sdk);
      expect(mockElicitStatus).toHaveBeenCalledOnce();
      expect(http.patch).toHaveBeenCalledTimes(3);
      expect(result.successCount).toBe(3);
    });

    it("dry-run predicts the refusal", async () => {
      const refused = await bulkUpdateStatusLogic(input(20, { dry_run: true }), ctx, sdk);
      expect(refused.dryRun?.wouldSucceed).toBe(false);
      expect(refused.dryRun?.validationErrors[0]).toMatchObject({
        code: "BULK_EXCEEDS_CAPACITY",
        field: "entityIds",
      });
      expect(refused.dryRun?.validationErrors[0]?.message).toContain("9 item(s) fit");
      const fits = await bulkUpdateStatusLogic(input(3, { dry_run: true }), ctx, sdk);
      expect(fits.dryRun?.wouldSucceed).toBe(true);
      expect(http.patch).not.toHaveBeenCalled();
    });
  });

  describe("pinterest_bulk_update_entities (3 tokens/item)", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: ids(n).map((entityId) => ({ entityId, data: { name: "n" } })),
        ...extra,
      }) as any;

    it("refuses a 50-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(bulkUpdateEntitiesLogic(input(50), ctx, sdk), 50, 9);
    });

    it("a batch that fits proceeds", async () => {
      const result = await bulkUpdateEntitiesLogic(input(3), ctx, sdk);
      expect(http.patch).toHaveBeenCalledTimes(3);
      expect(result.successCount).toBe(3);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await bulkUpdateEntitiesLogic(input(50, { dry_run: true }), ctx, sdk);
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("BULK_EXCEEDS_CAPACITY");
    });
  });

  describe("pinterest_bulk_create_entities (3 tokens/item)", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: Array.from({ length: n }, (_, i) => ({ name: `c${i}` })),
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

  describe("pinterest_adjust_bids (read 1 + write 3 per ad group)", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        adAccountId: ACCOUNT,
        adjustments: ids(n).map((adGroupId) => ({ adGroupId, bidPrice: 1.5 })),
        ...extra,
      }) as any;

    it("refuses a 50-item batch before confirmation and before any HTTP call", async () => {
      await expectRefused(adjustBidsLogic(input(50), ctx, sdk), 50, 6);
    });

    it("a batch that fits proceeds", async () => {
      const result = await adjustBidsLogic(input(2), ctx, sdk);
      expect(mockElicitBid).toHaveBeenCalledOnce();
      expect(http.get).toHaveBeenCalledTimes(2);
      expect(http.patch).toHaveBeenCalledTimes(2);
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

  describe("pinterest_delete_entity", () => {
    const input = (entityType: string, n: number, extra: Record<string, unknown> = {}) =>
      ({ entityType, adAccountId: ACCOUNT, entityIds: ids(n), ...extra }) as any;

    it("archive types (one 3-token PATCH per id): refuses 20 before confirmation and HTTP", async () => {
      await expectRefused(deleteEntityLogic(input("adGroup", 20), ctx, sdk), 20, 9);
    });

    it("archive types: a batch that fits proceeds", async () => {
      const result = await deleteEntityLogic(input("ad", 3), ctx, sdk);
      expect(mockElicitDelete).toHaveBeenCalledOnce();
      expect(http.patch).toHaveBeenCalledTimes(3);
      expect(result.succeededCount).toBe(3);
    });

    it("archive types: dry-run predicts the refusal", async () => {
      const result = await deleteEntityLogic(input("campaign", 20, { dry_run: true }), ctx, sdk);
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("BULK_EXCEEDS_CAPACITY");
    });

    it("creative (Pin DELETE) is one 3-token consume for the whole batch — not refused", async () => {
      const result = await deleteEntityLogic(input("creative", 20), ctx, sdk);
      expect(http.delete).toHaveBeenCalledTimes(20);
      expect(rateLimiter.getRemainingTokens(`pinterest:${ACCOUNT}`)).toBe(7);
      expect(result.succeededCount).toBe(20);
    });
  });
});
