// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check: a batch the rate limiter cannot admit within its
 * queue budget is refused BEFORE the confirmation prompt and BEFORE any
 * upstream call, and the dry run predicts the refusal.
 *
 * Runs the real DV360Service / TargetingService against a limiter built exactly
 * like the package's (`createPlatformRateLimiter("dv360", ...)` — 6/min, 120s
 * queue budget, so at most 18 calls per advertiser fit), with only the HTTP
 * transport and the elicitation prompts mocked so the test can count what
 * would have left the process. No window pre-loading is needed: at DV360's
 * default limit a 10-item bulk status change (GET + PATCH per item) already
 * needs 20 calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockResolveSessionServices, elicit } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  elicit: {
    bulkStatus: vi.fn(),
    bulkMutation: vi.fn(),
    bidChange: vi.fn(),
  },
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBulkStatusChangeConfirmation: elicit.bulkStatus,
    elicitBulkMutationConfirmation: elicit.bulkMutation,
    elicitBidChangeConfirmation: elicit.bidChange,
  };
});

import { createPlatformRateLimiter, JsonRpcErrorCode, McpError } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../../../src/config/index.js";
import { rateLimiter as packageRateLimiter } from "../../../../src/utils/platform.js";
import { DV360Service } from "../../../../src/services/dv360/DV360-service.js";
import { TargetingService } from "../../../../src/services/targeting/targeting-service.js";
import { bulkUpdateStatusLogic } from "../../../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkUpdateEntitiesLogic } from "../../../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { adjustLineItemBidsLogic } from "../../../../src/mcp-server/tools/definitions/adjust-line-item-bids.tool.js";
import { validateTargetingConfigLogic } from "../../../../src/mcp-server/tools/definitions/validate-targeting-config.tool.js";

const ADVERTISER = "1234567";
const ctx = { requestId: "req-1" } as any;
const sdk = { sessionId: "s-1" } as any;

const numericIds = (n: number, base = 5_000_000) =>
  Array.from({ length: n }, (_, i) => String(base + i));

let limiter: RateLimiter;
let fetch: ReturnType<typeof vi.fn>;

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
  for (const prompt of Object.values(elicit)) expect(prompt).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  limiter = createPlatformRateLimiter("dv360", mcpConfig.dv360RateLimitPerMinute);
  fetch = vi.fn().mockResolvedValue({});
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const httpClient = { fetch } as any;
  mockResolveSessionServices.mockReturnValue({
    dv360Service: new DV360Service(logger, limiter, httpClient),
    targetingService: new TargetingService(logger, limiter, httpClient),
  });
  for (const prompt of Object.values(elicit)) prompt.mockResolvedValue(true);
});

afterEach(() => {
  limiter.destroy();
});

describe("dv360 bulk capacity pre-check", () => {
  it("tests against the package's real limiter configuration (6/min, 120s budget)", () => {
    expect(limiter.describeLimits()).toEqual(packageRateLimiter.describeLimits());
    expect(limiter.describeLimits()).toEqual([
      { pattern: "dv360:*", limit: 6, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  // GET + PATCH per entity = 20 calls; 18 fit in 120s → 9 items fit.
  it("bulk_update_status: refuses 10 entities before the prompt and before any GET", async () => {
    await expectRefused(
      () =>
        bulkUpdateStatusLogic(
          {
            entityType: "lineItem",
            advertiserId: ADVERTISER,
            entityIds: numericIds(10),
            status: "ENTITY_STATUS_PAUSED",
          } as any,
          ctx,
          sdk
        ),
      9
    );
    expectNothingSent();
  });

  it("bulk_update_entities: counts updateEntity's own GET — refuses 10 items", async () => {
    await expectRefused(
      () =>
        bulkUpdateEntitiesLogic(
          {
            entityType: "lineItem",
            advertiserId: ADVERTISER,
            items: numericIds(10).map((entityId) => ({
              entityId,
              data: { displayName: "x" },
              updateMask: "displayName",
            })),
          } as any,
          ctx,
          sdk
        ),
      9
    );
    expectNothingSent();
  });

  it("bulk_create_entities: refuses 19 creates (18 fit) before any POST", async () => {
    await expectRefused(
      () =>
        bulkCreateEntitiesLogic(
          {
            entityType: "campaign",
            advertiserId: ADVERTISER,
            items: numericIds(19).map((n) => ({ displayName: n })),
          } as any,
          ctx,
          sdk
        ),
      18
    );
    expectNothingSent();
  });

  it("adjust_line_item_bids: refuses 10 same-advertiser adjustments before any prompt", async () => {
    await expectRefused(
      () =>
        adjustLineItemBidsLogic(
          {
            adjustments: numericIds(10).map((lineItemId) => ({
              advertiserId: ADVERTISER,
              lineItemId,
              newBidMicros: 1_000_000,
            })),
          } as any,
          ctx,
          sdk
        ),
      9
    );
    expectNothingSent();
  });

  it("validate_targeting_config: refuses 4 line items x 6 default targeting types (24 calls)", async () => {
    await expectRefused(
      () =>
        validateTargetingConfigLogic(
          { advertiserId: ADVERTISER, lineItemIds: numericIds(4) } as any,
          ctx,
          sdk
        ),
      3
    );
    expectNothingSent();
  });

  it("dry runs predict the refusal (BULK_EXCEEDS_CAPACITY) and reserve nothing", async () => {
    const results = [
      await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: ADVERTISER,
          entityIds: numericIds(10),
          status: "ENTITY_STATUS_PAUSED",
          dry_run: true,
        } as any,
        ctx,
        sdk
      ),
      await bulkUpdateEntitiesLogic(
        {
          entityType: "lineItem",
          advertiserId: ADVERTISER,
          items: numericIds(10).map((entityId) => ({
            entityId,
            data: { displayName: "x" },
            updateMask: "displayName",
          })),
          dry_run: true,
        } as any,
        ctx,
        sdk
      ),
      await bulkCreateEntitiesLogic(
        {
          entityType: "campaign",
          advertiserId: ADVERTISER,
          items: numericIds(19).map((n) => ({ displayName: n })),
          dry_run: true,
        } as any,
        ctx,
        sdk
      ),
      await adjustLineItemBidsLogic(
        {
          adjustments: numericIds(10).map((lineItemId) => ({
            advertiserId: ADVERTISER,
            lineItemId,
            newBidMicros: 1_000_000,
          })),
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
    // Nothing reserved: the whole window is still free.
    expect(limiter.getRemainingTokens(`dv360:${ADVERTISER}`)).toBe(6);
    expectNothingSent();
  });

  it("adjust_line_item_bids: items are projected per advertiser key", async () => {
    // 5 + 5 adjustments on two advertisers = 10 calls per key — each fits.
    const result = await adjustLineItemBidsLogic(
      {
        adjustments: numericIds(10).map((lineItemId, i) => ({
          advertiserId: i < 5 ? "111" : "222",
          lineItemId,
          newBidMicros: 1_000_000,
        })),
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.validationErrors.map((e) => e.code)).not.toContain(
      "BULK_EXCEEDS_CAPACITY"
    );
  });

  it("a request that fits proceeds: validate_targeting_config issues its 6 calls", async () => {
    fetch.mockResolvedValue({ assignedTargetingOptions: [] });
    const result = await validateTargetingConfigLogic(
      { advertiserId: ADVERTISER, lineItemIds: numericIds(1) } as any,
      ctx,
      sdk
    );
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(result.summary.totalEntitiesChecked).toBe(1);
  });

  it("a batch that fits proceeds: bulk_update_status prompts once and reads each entity", async () => {
    await bulkUpdateStatusLogic(
      {
        entityType: "lineItem",
        advertiserId: ADVERTISER,
        entityIds: numericIds(3),
        status: "ENTITY_STATUS_PAUSED",
      } as any,
      ctx,
      sdk
    );
    expect(elicit.bulkStatus).toHaveBeenCalledOnce();
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
