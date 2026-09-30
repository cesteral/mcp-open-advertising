// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tenant isolation of the TikTok rate limiter (#237, cross-fleet #5).
 *
 * Every HTTP tenant on an instance used to draw on one `tiktok:default` bucket
 * (and one `tiktok:reporting`), so one tenant's bulk job queued every other
 * tenant's calls and could get their bulk batches refused. The keys are now
 * per TikTok access token.
 *
 * Runs real sessions exactly as the transport builds them — a real
 * `TikTokAccessTokenAdapter` per token, `createSessionServices`, the real
 * session store — on the package's REAL module limiter (10/min, 120s queue
 * budget), which the bulk capacity pre-check reads. Only the outbound HTTP and
 * the confirmation prompt are faked. Written against APIs that predate the
 * fix, so it runs (and fails) on the old keying too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBulkMutationConfirmation: confirm };
});

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { TikTokAccessTokenAdapter } from "../../src/auth/tiktok-auth-adapter.js";
import { TikTokHttpClient } from "../../src/services/tiktok/tiktok-http-client.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";

const logger = pino({ level: "silent" });
const ctx = { requestId: "req-1" } as any;
const ADVERTISER = "7000000000000000001";
const openSessions: string[] = [];

let postSpy: ReturnType<typeof vi.spyOn>;

/** A session for `token`, built as the HTTP transport builds one. */
function openSession(sessionId: string, token: string): SessionServices {
  const services = createSessionServices(
    new TikTokAccessTokenAdapter(token, ADVERTISER),
    {
      baseUrl: mcpConfig.tiktokApiBaseUrl,
      reportPollIntervalMs: mcpConfig.tiktokReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.tiktokReportMaxPollAttempts,
      apiVersion: mcpConfig.tiktokApiVersion,
    },
    logger,
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  openSessions.push(sessionId);
  return services;
}

/** Fire `n` reads for a session without awaiting them: the first 10 are admitted, the rest queue. */
function backlog(services: SessionServices, n: number): void {
  for (let i = 0; i < n; i++) {
    void services.tiktokService.getEntity("campaign", `c-${i}`, ctx).catch(() => {});
  }
}

/** Resolves true once `promise` settles within the fake clock's current instant. */
async function settledNow(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true)
  );
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

beforeEach(() => {
  vi.useFakeTimers();
  rateLimiter.clear();
  confirm.mockReset().mockResolvedValue(true);
  vi.spyOn(TikTokHttpClient.prototype, "get").mockResolvedValue({
    list: [{ campaign_id: "c" }],
    page_info: { page: 1, page_size: 1, total_number: 1, total_page: 1 },
  });
  postSpy = vi.spyOn(TikTokHttpClient.prototype, "post").mockResolvedValue({});
});

afterEach(() => {
  rateLimiter.clear();
  for (const id of openSessions.splice(0)) sessionServiceStore.delete(id);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("tiktok rate limiting is per tenant access token", () => {
  it("tests against the package's configured limit", () => {
    expect(mcpConfig.tiktokRateLimitPerMinute).toBe(10);
  });

  it("a tenant that fills its window does not queue another tenant's call", async () => {
    const a = openSession("s-a", "token-tenant-A");
    const b = openSession("s-b", "token-tenant-B");

    backlog(a, 10); // A's whole minute
    await vi.advanceTimersByTimeAsync(0);

    const aNext = a.tiktokService.getEntity("campaign", "a-11", ctx);
    const bFirst = b.tiktokService.getEntity("campaign", "b-1", ctx);

    expect(await settledNow(bFirst)).toBe(true); // B is admitted at once
    expect(await settledNow(aNext)).toBe(false); // A's 11th waits for its own window

    await vi.advanceTimersByTimeAsync(60_000);
    expect(await settledNow(aNext)).toBe(true);
  });

  it("keeps two sessions on the same token in one bucket (one TikTok authorization)", async () => {
    const a1 = openSession("s-a1", "token-tenant-A");
    const a2 = openSession("s-a2", "token-tenant-A");

    backlog(a1, 10);
    await vi.advanceTimersByTimeAsync(0);

    expect(await settledNow(a2.tiktokService.getEntity("campaign", "a2-1", ctx))).toBe(false);
  });

  it("one tenant's report polling does not queue another tenant's report calls", async () => {
    const a = openSession("s-a", "token-tenant-A");
    const b = openSession("s-b", "token-tenant-B");

    for (let i = 0; i < 10; i++) {
      void a.tiktokReportingService.checkReportStatus(`task-${i}`, ctx).catch(() => {});
    }
    await vi.advanceTimersByTimeAsync(0);

    const aNext = a.tiktokReportingService.checkReportStatus("task-a", ctx);
    const bFirst = b.tiktokReportingService.checkReportStatus("task-b", ctx);
    expect(await settledNow(bFirst)).toBe(true);
    expect(await settledNow(aNext)).toBe(false);
  });

  it("one tenant's backlog does not get another tenant's bulk batch refused", async () => {
    const a = openSession("s-a", "token-tenant-A");
    openSession("s-b", "token-tenant-B");

    // 30 of A's reads in flight: 10 admitted, 10 queued at +60s, 10 at +120s.
    // A 3-item update batch (3 tokens each) on A's bucket would clear at
    // +180s, past the 120s budget, so none of it fits.
    backlog(a, 30);
    await vi.advanceTimersByTimeAsync(0);

    const input = {
      entityType: "campaign",
      advertiserId: ADVERTISER,
      items: [
        { entityId: "c-1", data: { budget: 100 } },
        { entityId: "c-2", data: { budget: 100 } },
        { entityId: "c-3", data: { budget: 100 } },
      ],
    } as any;

    const refusedForA = await bulkUpdateEntitiesLogic(input, ctx, { sessionId: "s-a" } as any).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(refusedForA).toBeInstanceOf(McpError);
    expect((refusedForA as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((refusedForA as McpError).data).toMatchObject({
      reason: "bulk_exceeds_capacity",
      itemsThatFit: 0,
    });
    expect(postSpy).not.toHaveBeenCalled();

    // B's identical batch is admitted in full and runs without waiting.
    const resultForB = bulkUpdateEntitiesLogic(input, ctx, { sessionId: "s-b" } as any);
    await vi.advanceTimersByTimeAsync(0);
    await expect(resultForB).resolves.toMatchObject({
      confirmed: true,
      successCount: 3,
      failureCount: 0,
    });
    expect(postSpy).toHaveBeenCalledTimes(3);
  });
});
