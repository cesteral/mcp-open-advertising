// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tenant isolation of the Snapchat rate limiter (#237, snapchat #1,
 * cross-fleet #5).
 *
 * Every HTTP tenant on an instance used to draw on one `snapchat:default`
 * bucket (and one `snapchat:reporting`), so one tenant's bulk job queued every
 * other tenant's calls and could get their bulk batches refused. The keys are
 * now per Snap user (`/v1/me` id).
 *
 * Runs real sessions exactly as the transport builds them — a real
 * `SnapchatAccessTokenAdapter` per token, validated against a faked `/v1/me`,
 * `createSessionServices`, the real session store — on the package's REAL
 * module limiter (10/min, 120s queue budget), which the bulk capacity
 * pre-check reads. Only the outbound HTTP and the confirmation prompt are
 * faked. Written against APIs that predate the fix, so it runs (and fails) on
 * the old keying too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBulkStatusChangeConfirmation: confirm };
});

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { SnapchatAccessTokenAdapter } from "../../src/auth/snapchat-auth-adapter.js";
import { SnapchatHttpClient } from "../../src/services/snapchat/snapchat-http-client.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

const logger = pino({ level: "silent" });
const ctx = { requestId: "req-1" } as any;
const ACCOUNT = "acct-1";
/** Which Snap user each test token authenticates, as `/v1/me` reports it. */
const USER_OF_TOKEN: Record<string, string> = {
  "token-tenant-A": "3b8f2c1e-0000-4000-8000-00000000000a",
  "token-tenant-A-second": "3b8f2c1e-0000-4000-8000-00000000000a",
  "token-tenant-B": "3b8f2c1e-0000-4000-8000-00000000000b",
};
const openSessions: string[] = [];

let putSpy: ReturnType<typeof vi.spyOn>;

/** A validated session for `token`, built as the HTTP transport builds one. */
async function openSession(sessionId: string, token: string): Promise<SessionServices> {
  const adapter = new SnapchatAccessTokenAdapter(token, ACCOUNT, mcpConfig.snapchatApiBaseUrl);
  await adapter.validate();
  const services = createSessionServices(
    adapter,
    {
      baseUrl: mcpConfig.snapchatApiBaseUrl,
      reportPollIntervalMs: mcpConfig.snapchatReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.snapchatReportMaxPollAttempts,
    },
    logger,
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  openSessions.push(sessionId);
  return services;
}

/** GET /v1/campaigns/{id} owned by the bound account; a still-running stats report. */
function fakeGet(path: string, params?: Record<string, string>) {
  if (path.endsWith("/stats_report")) {
    return {
      request_status: "SUCCESS",
      async_stats_reports: [
        {
          async_stats_report: { report_run_id: params?.report_run_id, async_status: "RUNNING" },
        },
      ],
    };
  }
  const id = path.split("/")[3];
  return {
    request_status: "SUCCESS",
    campaigns: [
      {
        sub_request_status: "SUCCESS",
        campaign: { id, name: "n", status: "ACTIVE", ad_account_id: ACCOUNT },
      },
    ],
  };
}

/** Fire `n` campaign reads without awaiting them: the first 10 are admitted, the rest queue. */
function backlog(services: SessionServices, n: number): void {
  for (let i = 0; i < n; i++) {
    void services.snapchatService.getEntity("campaign", `c-${i}`, ctx).catch(() => {});
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
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const token = auth.replace(/^Bearer /, "");
    return new Response(
      JSON.stringify({ request_status: "SUCCESS", me: { id: USER_OF_TOKEN[token] } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  vi.spyOn(SnapchatHttpClient.prototype, "get").mockImplementation(async (path, params) =>
    fakeGet(path, params)
  );
  putSpy = vi.spyOn(SnapchatHttpClient.prototype, "put").mockImplementation(async (_path, body) => {
    const items = (body as { campaigns: Array<Record<string, unknown>> }).campaigns;
    return {
      request_status: "SUCCESS",
      campaigns: items.map((campaign) => ({ sub_request_status: "SUCCESS", campaign })),
    };
  });
});

afterEach(() => {
  rateLimiter.clear();
  for (const id of openSessions.splice(0)) sessionServiceStore.delete(id);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("snapchat rate limiting is per tenant (Snap user)", () => {
  it("tests against the package's configured limit", () => {
    expect(mcpConfig.snapchatRateLimitPerMinute).toBe(10);
  });

  it("a tenant that fills its window does not queue another tenant's call", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    const b = await openSession("s-b", "token-tenant-B");

    backlog(a, 10); // A's whole minute
    await vi.advanceTimersByTimeAsync(0);

    const aNext = a.snapchatService.getEntity("campaign", "a-11", ctx);
    const bFirst = b.snapchatService.getEntity("campaign", "b-1", ctx);

    expect(await settledNow(bFirst)).toBe(true); // B is admitted at once
    expect(await settledNow(aNext)).toBe(false); // A's 11th waits for its own window

    await vi.advanceTimersByTimeAsync(60_000);
    expect(await settledNow(aNext)).toBe(true);
  });

  it("keeps one Snap user in one bucket across two tokens (the refresh flow rotates tokens)", async () => {
    const a1 = await openSession("s-a1", "token-tenant-A");
    const a2 = await openSession("s-a2", "token-tenant-A-second");

    backlog(a1, 10);
    await vi.advanceTimersByTimeAsync(0);

    expect(await settledNow(a2.snapchatService.getEntity("campaign", "a2-1", ctx))).toBe(false);
  });

  it("one tenant's report polling does not queue another tenant's report calls", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    const b = await openSession("s-b", "token-tenant-B");

    for (let i = 0; i < 10; i++) {
      void a.snapchatReportingService.checkReportStatus(`run-${i}`, ctx).catch(() => {});
    }
    await vi.advanceTimersByTimeAsync(0);

    const aNext = a.snapchatReportingService.checkReportStatus("run-a", ctx);
    const bFirst = b.snapchatReportingService.checkReportStatus("run-b", ctx);
    expect(await settledNow(bFirst)).toBe(true);
    expect(await settledNow(aNext)).toBe(false);
  });

  it("one tenant's backlog does not get another tenant's bulk batch refused", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    await openSession("s-b", "token-tenant-B");

    // 30 of A's reads in flight: 10 admitted, 10 queued at +60s, 10 at +120s.
    // A 2-campaign status batch (one 3-token PUT, then a read per campaign)
    // on A's bucket would clear at +180s, past the 120s budget.
    backlog(a, 30);
    await vi.advanceTimersByTimeAsync(0);

    const input = {
      entityType: "campaign",
      adAccountId: ACCOUNT,
      entityIds: ["c-1", "c-2"],
      operationStatus: "PAUSED",
    } as any;

    const refusedForA = await bulkUpdateStatusLogic(input, ctx, { sessionId: "s-a" } as any).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(refusedForA).toBeInstanceOf(McpError);
    expect((refusedForA as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((refusedForA as McpError).data).toMatchObject({
      reason: "bulk_exceeds_capacity",
      itemsThatFit: 0,
    });
    expect(putSpy).not.toHaveBeenCalled();

    // B's identical batch is admitted in full and runs without waiting.
    const resultForB = bulkUpdateStatusLogic(input, ctx, { sessionId: "s-b" } as any);
    await vi.advanceTimersByTimeAsync(0);
    await expect(resultForB).resolves.toMatchObject({ successCount: 2, failureCount: 0 });
    expect(putSpy).toHaveBeenCalledTimes(1);
  });
});
