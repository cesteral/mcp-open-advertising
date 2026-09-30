// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check: a batch the rate limiter cannot admit within its
 * queue budget is refused BEFORE the confirmation prompt and BEFORE any
 * upstream call, and the dry run predicts the refusal.
 *
 * Runs the real TtdService against a limiter built exactly like the package's
 * (`createPlatformRateLimiter("ttd", mcpConfig.ttdRateLimitPerMinute)` — 60/min,
 * 120s queue budget), with only the HTTP transport and the elicitation prompts
 * mocked so the test can count what would have left the process.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockResolveSessionServices, elicit } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  elicit: {
    bulkStatus: vi.fn(),
    archive: vi.fn(),
    bulkMutation: vi.fn(),
    bidChange: vi.fn(),
  },
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBulkStatusChangeConfirmation: elicit.bulkStatus,
    elicitArchiveConfirmation: elicit.archive,
    elicitBulkMutationConfirmation: elicit.bulkMutation,
    elicitBidChangeConfirmation: elicit.bidChange,
  };
});

import { createPlatformRateLimiter, JsonRpcErrorCode, McpError } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter as packageRateLimiter } from "../../src/utils/platform.js";
import { TtdService } from "../../src/services/ttd/ttd-service.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { archiveEntitiesLogic } from "../../src/mcp-server/tools/definitions/archive-entities.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { bidListBulkLogic } from "../../src/mcp-server/tools/definitions/bulk-manage-bid-lists.tool.js";

const PARTNER = "partner-1";
const KEY = `ttd:${PARTNER}`;
const ctx = { requestId: "req-1" } as any;
const sdk = { sessionId: "s-1" } as any;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

let limiter: RateLimiter;
let fetch: ReturnType<typeof vi.fn>;
let fetchDirect: ReturnType<typeof vi.fn>;

/**
 * Reserve `n` tokens on the partner key the way earlier in-flight calls would
 * (60 admitted now, the rest queued at +60s / +120s). Not awaited: a queued
 * caller holds its reservation while it sleeps.
 */
function preload(n: number): void {
  for (let i = 0; i < n; i++) void limiter.consume(KEY).catch(() => {});
}

/** How many more 1-token requests the key admits within the 120s budget. */
function tokensAdmissibleInBudget(): number {
  const { admissionOffsetsMs } = limiter.projectAdmissions(KEY, new Array(300).fill(1));
  return admissionOffsetsMs.filter((offset) => offset <= 120_000).length;
}

async function expectRefused(run: () => Promise<unknown>, itemsThatFit: number): Promise<void> {
  const error = await run().then(
    () => undefined,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(McpError);
  expect((error as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
  expect((error as McpError).data).toMatchObject({
    reason: "bulk_exceeds_capacity",
    itemsThatFit,
  });
}

function expectNothingSent(): void {
  expect(fetch).not.toHaveBeenCalled();
  expect(fetchDirect).not.toHaveBeenCalled();
  for (const prompt of Object.values(elicit)) expect(prompt).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  limiter = createPlatformRateLimiter("ttd", mcpConfig.ttdRateLimitPerMinute);
  fetch = vi.fn().mockResolvedValue({});
  fetchDirect = vi.fn().mockResolvedValue({ data: { bidListUpdate: { data: { id: "bl" } } } });
  const service = new TtdService(
    { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    limiter,
    { partnerId: PARTNER, fetch, fetchDirect } as any
  );
  mockResolveSessionServices.mockReturnValue({ ttdService: service });
  for (const prompt of Object.values(elicit)) prompt.mockResolvedValue(true);
});

afterEach(() => {
  limiter.destroy();
});

describe("ttd bulk capacity pre-check", () => {
  it("tests against the package's real limiter configuration", () => {
    expect(limiter.describeLimits()).toEqual(packageRateLimiter.describeLimits());
    expect(limiter.describeLimits()).toEqual([
      expect.objectContaining({ pattern: "ttd:*", windowMs: 60_000, maxWaitMs: 120_000 }),
    ]);
  });

  // 150 tokens already held → the window admits 30 more within the 120s budget
  // (60 now, 60 at +60s, 60 at +120s = 180), so a 50-item, 1-token-per-item
  // batch is refused with 30 fitting.
  it("bulk_update_status: refuses before the prompt and before any PUT", async () => {
    preload(150);
    await expectRefused(
      () =>
        bulkUpdateStatusLogic(
          { entityType: "adGroup", entityIds: ids(50), status: "Paused" } as any,
          ctx,
          sdk
        ),
      30
    );
    expectNothingSent();
  });

  it("archive_entities: refuses before the prompt and before any PUT", async () => {
    preload(150);
    await expectRefused(
      () => archiveEntitiesLogic({ entityType: "campaign", entityIds: ids(50) } as any, ctx, sdk),
      30
    );
    expectNothingSent();
  });

  it("bulk_update_entities: refuses before the prompt and before any PUT", async () => {
    preload(150);
    await expectRefused(
      () =>
        bulkUpdateEntitiesLogic(
          {
            entityType: "campaign",
            advertiserId: "adv",
            items: ids(50).map((entityId) => ({ entityId, data: { CampaignName: "x" } })),
          } as any,
          ctx,
          sdk
        ),
      30
    );
    expectNothingSent();
  });

  it("bulk_create_entities: refuses before any POST", async () => {
    preload(150);
    await expectRefused(
      () =>
        bulkCreateEntitiesLogic(
          {
            entityType: "campaign",
            advertiserId: "adv",
            items: ids(50).map((n) => ({ CampaignName: n })),
          } as any,
          ctx,
          sdk
        ),
      30
    );
    expectNothingSent();
  });

  it("bulk_manage_bid_lists: refuses before any GraphQL request", async () => {
    preload(150);
    await expectRefused(
      () =>
        bidListBulkLogic(
          { operation: "batch_update", items: ids(50).map((id) => ({ id })) } as any,
          ctx,
          sdk
        ),
      30
    );
    expectNothingSent();
  });

  // Without currencyCode each adjustment reads the ad group, then PUTs: 2
  // tokens per item. With 100 already held, item k's PUT is token 100 + 2k,
  // which must be <= 180 → 40 items fit.
  it("adjust_bids: counts the currency read — refuses 50 no-currency adjustments", async () => {
    preload(100);
    await expectRefused(
      () =>
        adjustBidsLogic(
          { adjustments: ids(50).map((adGroupId) => ({ adGroupId, baseBidCpm: 2 })) } as any,
          ctx,
          sdk
        ),
      40
    );
    expectNothingSent();
  });

  it("dry runs predict the refusal (BULK_EXCEEDS_CAPACITY) and reserve nothing", async () => {
    preload(150);
    expect(tokensAdmissibleInBudget()).toBe(30);

    const results = [
      await bulkUpdateStatusLogic(
        { entityType: "adGroup", entityIds: ids(50), status: "Paused", dry_run: true } as any,
        ctx,
        sdk
      ),
      await archiveEntitiesLogic(
        { entityType: "campaign", entityIds: ids(50), dry_run: true } as any,
        ctx,
        sdk
      ),
      await bulkUpdateEntitiesLogic(
        {
          entityType: "campaign",
          advertiserId: "adv",
          items: ids(50).map((entityId) => ({ entityId, data: { CampaignName: "x" } })),
          dry_run: true,
        } as any,
        ctx,
        sdk
      ),
      await bulkCreateEntitiesLogic(
        {
          entityType: "campaign",
          advertiserId: "adv",
          items: ids(50).map((n) => ({ CampaignName: n })),
          dry_run: true,
        } as any,
        ctx,
        sdk
      ),
      await bidListBulkLogic(
        { operation: "batch_get", bidListIds: ids(50), dry_run: true } as any,
        ctx,
        sdk
      ),
      await adjustBidsLogic(
        {
          adjustments: ids(50).map((adGroupId) => ({ adGroupId, baseBidCpm: 2 })),
          dry_run: true,
        } as any,
        ctx,
        sdk
      ),
    ];

    for (const result of results) {
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("BULK_EXCEEDS_CAPACITY");
    }
    // Nothing was reserved: the same 30 tokens are still admissible in budget.
    expect(tokensAdmissibleInBudget()).toBe(30);
    expectNothingSent();
  });

  it("adjust_bids dry run: the same batch fits when currencyCode skips the read", async () => {
    preload(100);
    const withCurrency = await adjustBidsLogic(
      {
        adjustments: ids(50).map((adGroupId) => ({
          adGroupId,
          baseBidCpm: 2,
          currencyCode: "EUR",
        })),
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(withCurrency.dryRun?.wouldSucceed).toBe(true);
    expect(withCurrency.dryRun?.validationErrors).toEqual([]);
  });

  it("a batch that fits proceeds: one prompt, one PUT per entity", async () => {
    const result = await bulkUpdateStatusLogic(
      { entityType: "adGroup", entityIds: ids(20), status: "Paused" } as any,
      ctx,
      sdk
    );
    expect(elicit.bulkStatus).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(20);
    expect(result.successCount).toBe(20);
  });

  it("a fitting dry run reports no capacity error", async () => {
    const result = await bulkUpdateStatusLogic(
      { entityType: "adGroup", entityIds: ids(100), status: "Paused", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.validationErrors).toEqual([]);
  });
});
