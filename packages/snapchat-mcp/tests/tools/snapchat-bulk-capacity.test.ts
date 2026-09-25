// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check: with the package's REAL default limiter
 * (`utils/platform.ts`, 10/min, queue budget 120s), a batch whose last request
 * would queue past the budget is refused with `RateLimited` before any
 * confirmation prompt and before any upstream HTTP call; a batch that fits
 * proceeds; the dry-run predicts the refusal.
 *
 * Snapchat's per-item cost includes the ownership walk every `getEntity` makes
 * (ad → ad squad → campaign). The "fits" cases run the REAL service against a
 * fake HTTP client whose ad squads/ads carry no `ad_account_id` (forcing the
 * full walk) and assert the tokens actually consumed equal the modeled cost.
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
import {
  SnapchatService,
  getEntityWorstCaseConsumes,
} from "../../src/services/snapchat/snapchat-service.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { deleteEntityLogic } from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const ACCOUNT = "acct-1";
const KEY = "snapchat:default";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

const ENTITY_KEY: Record<string, string> = {
  campaigns: "campaign",
  adsquads: "adsquad",
  ads: "ad",
  creatives: "creative",
};

/** GET /v1/{collection}/{id}. Only campaigns/creatives carry ad_account_id, so reads walk. */
function fakeGet(path: string) {
  const [, , collection, id] = path.split("/");
  const entity: Record<string, unknown> = { id, name: "n", status: "ACTIVE" };
  if (collection === "campaigns" || collection === "creatives") entity.ad_account_id = ACCOUNT;
  if (collection === "adsquads") entity.campaign_id = `camp-of-${id}`;
  if (collection === "ads") entity.ad_squad_id = `squad-of-${id}`;
  return { [collection]: [{ sub_request_status: "SUCCESS", [ENTITY_KEY[collection]]: entity }] };
}

/** Echo every item of a create/update body back as a successful sub-request. */
function fakeWrite(_path: string, body: Record<string, unknown[]>) {
  const [collection] = Object.keys(body);
  return {
    [collection]: body[collection].map((e) => ({
      sub_request_status: "SUCCESS",
      [ENTITY_KEY[collection]]: e,
    })),
  };
}

let http: Record<"get" | "post" | "put" | "delete", ReturnType<typeof vi.fn>>;

function expectNoUpstreamOrPrompt() {
  for (const m of Object.values(http)) expect(m).not.toHaveBeenCalled();
  for (const m of [mockElicitStatus, mockElicitMutation, mockElicitBid, mockElicitDelete]) {
    expect(m).not.toHaveBeenCalled();
  }
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

const used = () => 10 - rateLimiter.getRemainingTokens(KEY);

describe("snapchat bulk capacity pre-check (real default limiter: 10/min, 120s budget)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.clear();
    http = {
      get: vi.fn().mockImplementation(async (path: string) => fakeGet(path)),
      post: vi.fn().mockImplementation(async (p: string, b: any) => fakeWrite(p, b)),
      put: vi.fn().mockImplementation(async (p: string, b: any) => fakeWrite(p, b)),
      delete: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({
      snapchatService: new SnapchatService(http as any, "org-1", ACCOUNT, rateLimiter),
      boundAdAccountId: ACCOUNT,
    });
    for (const m of [mockElicitStatus, mockElicitMutation, mockElicitBid, mockElicitDelete]) {
      m.mockResolvedValue(true);
    }
  });

  it("the package limiter is the default 10/min with a 120s queue budget", () => {
    expect(rateLimiter.describeLimits()).toEqual([
      { pattern: "snapchat:*", limit: 10, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  it("models the ownership walk: ad 3 reads, ad squad 2, campaign/creative 1", () => {
    expect(getEntityWorstCaseConsumes("ad")).toEqual([1, 1, 1]);
    expect(getEntityWorstCaseConsumes("adGroup")).toEqual([1, 1]);
    expect(getEntityWorstCaseConsumes("campaign")).toEqual([1]);
    expect(getEntityWorstCaseConsumes("creative")).toEqual([1]);
  });

  describe("snapchat_bulk_update_status (one 3-token PUT, then getEntity + walk per item)", () => {
    const input = (entityType: string, n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType,
        adAccountId: ACCOUNT,
        ...(entityType === "adGroup" ? { campaignId: "c1" } : {}),
        ...(entityType === "ad" ? { adSquadId: "s1" } : {}),
        entityIds: ids(n),
        operationStatus: "PAUSED",
        ...extra,
      }) as any;

    it("refuses 20 ads (3 + 20×3 tokens) before confirmation and before any HTTP call", async () => {
      await expectRefused(bulkUpdateStatusLogic(input("ad", 20), ctx, sdk), 20, 9);
    });

    it("refuses 20 ad squads (3 + 20×2 tokens), 13 fit", async () => {
      await expectRefused(bulkUpdateStatusLogic(input("adGroup", 20), ctx, sdk), 20, 13);
    });

    it("counts the per-batch PUT: 8 ads fit on a fresh window only because 3 + 8×3 ≤ 30", async () => {
      await rateLimiter.consume(KEY, 1);
      // 1 already used + 3 + 9×3 = 31 tokens > the 30 admitted by 120s.
      await expectRefused(bulkUpdateStatusLogic(input("ad", 9), ctx, sdk), 9, 8);
    });

    it("a batch that fits proceeds, consuming exactly the modeled tokens", async () => {
      const result = await bulkUpdateStatusLogic(input("ad", 2), ctx, sdk);
      expect(mockElicitStatus).toHaveBeenCalledOnce();
      expect(http.get).toHaveBeenCalledTimes(6); // 2 ads + 2 squads + 2 campaigns
      expect(http.put).toHaveBeenCalledTimes(1);
      expect(result.successCount).toBe(2);
      expect(used()).toBe(3 + 2 * 3);
    });

    it("dry-run predicts the refusal", async () => {
      const refused = await bulkUpdateStatusLogic(input("ad", 20, { dry_run: true }), ctx, sdk);
      expect(refused.dryRun?.wouldSucceed).toBe(false);
      expect(refused.dryRun?.validationErrors[0]).toMatchObject({
        code: "BULK_EXCEEDS_CAPACITY",
        field: "entityIds",
      });
      expect(refused.dryRun?.validationErrors[0]?.message).toContain("9 item(s) fit");
      const fits = await bulkUpdateStatusLogic(input("campaign", 20, { dry_run: true }), ctx, sdk);
      expect(fits.dryRun?.wouldSucceed).toBe(true);
      expectNoUpstreamOrPrompt();
    });
  });

  describe("snapchat_bulk_update_entities", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: ids(n).map((entityId) => ({ entityId, data: { name: "x" } })),
        ...extra,
      }) as any;

    it("refuses 50 campaigns (3 + 50 tokens) before confirmation and HTTP; 27 fit", async () => {
      await expectRefused(bulkUpdateEntitiesLogic(input(50), ctx, sdk), 50, 27);
    });

    it("a batch that fits proceeds, consuming exactly the modeled tokens", async () => {
      const result = await bulkUpdateEntitiesLogic(input(5), ctx, sdk);
      expect(http.get).toHaveBeenCalledTimes(5);
      expect(http.put).toHaveBeenCalledTimes(1);
      expect(result.successCount).toBe(5);
      expect(used()).toBe(3 + 5);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await bulkUpdateEntitiesLogic(input(50, { dry_run: true }), ctx, sdk);
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("BULK_EXCEEDS_CAPACITY");
    });
  });

  describe("snapchat_delete_entity (getEntity + walk, then a 3-token DELETE, per id)", () => {
    const input = (entityType: string, n: number, extra: Record<string, unknown> = {}) =>
      ({ entityType, adAccountId: ACCOUNT, entityIds: ids(n), ...extra }) as any;

    it("refuses 20 ads before confirmation and before any HTTP call", async () => {
      await expectRefused(deleteEntityLogic(input("ad", 20), ctx, sdk), 20, 4);
    });

    it("a batch that fits proceeds, consuming exactly the modeled tokens", async () => {
      const result = await deleteEntityLogic(input("ad", 1), ctx, sdk);
      expect(mockElicitDelete).toHaveBeenCalledOnce();
      expect(http.get).toHaveBeenCalledTimes(3);
      expect(http.delete).toHaveBeenCalledTimes(1);
      expect(result.succeededCount).toBe(1);
      expect(used()).toBe(3 + 3);
    });

    it("dry-run predicts the refusal", async () => {
      const result = await deleteEntityLogic(input("campaign", 20, { dry_run: true }), ctx, sdk);
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("BULK_EXCEEDS_CAPACITY");
    });
  });

  describe("snapchat_adjust_bids (read + campaign walk, 3-token PUT, re-read, per ad squad)", () => {
    const input = (n: number, extra: Record<string, unknown> = {}) =>
      ({
        adAccountId: ACCOUNT,
        adjustments: ids(n).map((adGroupId) => ({ adGroupId, bidPrice: 1.5 })),
        ...extra,
      }) as any;

    it("refuses 50 adjustments before confirmation and before any HTTP call", async () => {
      await expectRefused(adjustBidsLogic(input(50), ctx, sdk), 50, 4);
    });

    it("a batch that fits proceeds, consuming exactly the modeled tokens", async () => {
      const result = await adjustBidsLogic(input(1), ctx, sdk);
      expect(mockElicitBid).toHaveBeenCalledOnce();
      expect(http.get).toHaveBeenCalledTimes(3); // squad, its campaign, squad re-read
      expect(http.put).toHaveBeenCalledTimes(1);
      expect(result.totalSucceeded).toBe(1);
      expect(used()).toBe(1 + 1 + 3 + 1);
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

  it("snapchat_bulk_create_entities needs no pre-check: the whole batch is ONE 3-token POST", async () => {
    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: Array.from({ length: 50 }, (_, i) => ({ name: `c${i}` })),
      } as any,
      ctx,
      sdk
    );
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(used()).toBe(3);
    expect(result.successCount).toBe(50);
  });
});
