// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tenant isolation of the Pinterest rate limiter (#237).
 *
 * `pinterest:default` (ad-account list, targeting) and `pinterest:reporting`
 * were one bucket per process shared by every HTTP tenant on an instance, and
 * `pinterest:{adAccountId}` was shared by any tenant whose
 * `X-Pinterest-Advertiser-Id` header named that account — caller input. The
 * buckets are now the session's Pinterest user's (the `/v5/user_account` id).
 *
 * Runs real sessions as the transport builds them — a real
 * `PinterestAccessTokenAdapter` per token (validated against a stubbed
 * `GET /v5/user_account` that answers a different user id per token),
 * `createSessionServices`, the real session store and the package's real
 * process-wide limiter (10/min, 120s queue budget), which the bulk pre-check
 * reads. Only the Pinterest calls and the confirmation prompt are faked.
 * Written against APIs that predate the fix, so it runs (and fails) on the old
 * keying too.
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
import { PinterestAccessTokenAdapter } from "../../src/auth/pinterest-auth-adapter.js";
import { PinterestHttpClient } from "../../src/services/pinterest/pinterest-http-client.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

const logger = pino({ level: "silent" });
const ctx = { requestId: "req-1" } as any;
const SHARED_ACCOUNT = "549755885175";
const ids = (n: number) => Array.from({ length: n }, (_, i) => `68719476${i}`);

/** `GET /v5/user_account` answers a user id derived from the bearer token. */
const USER_IDS: Record<string, string> = {
  "token-tenant-A": "1001",
  "token-tenant-B": "2002",
};

let patchSpy: ReturnType<typeof vi.spyOn>;
const openSessions: string[] = [];

async function openSession(
  sessionId: string,
  token: string,
  adAccountId = SHARED_ACCOUNT
): Promise<SessionServices> {
  const adapter = new PinterestAccessTokenAdapter(
    token,
    adAccountId,
    mcpConfig.pinterestApiBaseUrl
  );
  await adapter.validate();
  const services = createSessionServices(
    adapter,
    {
      baseUrl: mcpConfig.pinterestApiBaseUrl,
      apiVersion: mcpConfig.pinterestApiVersion,
      reportPollIntervalMs: 1,
      reportMaxPollAttempts: 1,
    },
    logger,
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  openSessions.push(sessionId);
  return services;
}

/** Fire `n` calls without awaiting them: the first 10 are admitted, the rest queue. */
function backlog(n: number, call: (i: number) => Promise<unknown>): void {
  for (let i = 0; i < n; i++) void call(i).catch(() => {});
}

/** Whether `call` is admitted at once (true) or queued behind a full window (false). */
async function admittedAtOnce(call: () => Promise<unknown>): Promise<boolean> {
  let done = false;
  void call().then(
    () => (done = true),
    () => (done = true)
  );
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

beforeEach(async () => {
  confirm.mockReset().mockResolvedValue(true);
  rateLimiter.clear();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const token = auth.replace(/^Bearer /, "");
    return new Response(
      JSON.stringify({ id: USER_IDS[token], username: "u", account_type: "BUSINESS" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  vi.spyOn(PinterestHttpClient.prototype, "get").mockImplementation(async (path: string) => ({
    // getEntity requires the returned id to be the one asked for.
    id: decodeURIComponent(path.split("/").pop() ?? ""),
    items: [],
    report_status: "IN_PROGRESS",
  }));
  patchSpy = vi
    .spyOn(PinterestHttpClient.prototype, "patch")
    .mockResolvedValue({ items: [{ data: { id: "x" }, exceptions: [] }] });
});

afterEach(() => {
  for (const id of openSessions.splice(0)) sessionServiceStore.delete(id);
  rateLimiter.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("pinterest rate limiting is per tenant (Pinterest user)", () => {
  it("tests against the package's configured limit", () => {
    expect(mcpConfig.pinterestRateLimitPerMinute).toBe(10);
  });

  it("a tenant that fills its account-less window does not queue another tenant's ad-account list", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    const b = await openSession("s-b", "token-tenant-B");
    vi.useFakeTimers();

    backlog(10, () => a.pinterestService.listAdAccounts({}, ctx));
    await vi.advanceTimersByTimeAsync(0);

    expect(await admittedAtOnce(() => b.pinterestService.listAdAccounts({}, ctx))).toBe(true);
    expect(await admittedAtOnce(() => a.pinterestService.listAdAccounts({}, ctx))).toBe(false);
  });

  it("a tenant that fills its reporting window does not queue another tenant's report check", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    const b = await openSession("s-b", "token-tenant-B");
    vi.useFakeTimers();

    backlog(10, (i) => a.pinterestReportingService.checkReportStatus(`t-${i}`, ctx));
    await vi.advanceTimersByTimeAsync(0);

    expect(
      await admittedAtOnce(() => b.pinterestReportingService.checkReportStatus("t-b", ctx))
    ).toBe(true);
    expect(
      await admittedAtOnce(() => a.pinterestReportingService.checkReportStatus("t-a", ctx))
    ).toBe(false);
  });

  it("a tenant naming another tenant's ad account neither queues nor refuses that tenant", async () => {
    // Both sessions are bound to the same account id: B's header claims A's
    // account. The account segment is caller input, so it must not reach A.
    const a = await openSession("s-a", "token-tenant-A");
    await openSession("s-b", "token-tenant-B");
    vi.useFakeTimers();

    // 30 of B's reads on the account: 10 now, 10 at +60s, 10 at +120s — B's
    // window is full through the whole 120s budget.
    const b = sessionServiceStore.get("s-b")!;
    backlog(30, (i) =>
      b.pinterestService.getEntity("campaign", { adAccountId: SHARED_ACCOUNT }, `b-${i}`, ctx)
    );
    await vi.advanceTimersByTimeAsync(0);

    const refusedForB = await bulkUpdateStatusLogic(
      {
        entityType: "campaign",
        adAccountId: SHARED_ACCOUNT,
        entityIds: ids(3),
        operationStatus: "PAUSED",
      } as any,
      ctx,
      { sessionId: "s-b" } as any
    ).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(refusedForB).toBeInstanceOf(McpError);
    expect((refusedForB as McpError).code).toBe(JsonRpcErrorCode.RateLimited);

    // A's identical batch on its own account is admitted and runs at once.
    const resultForA = await bulkUpdateStatusLogic(
      {
        entityType: "campaign",
        adAccountId: SHARED_ACCOUNT,
        entityIds: ids(3),
        operationStatus: "PAUSED",
      } as any,
      ctx,
      { sessionId: "s-a" } as any
    );
    expect(resultForA).toMatchObject({ successCount: 3, failureCount: 0 });
    expect(patchSpy).toHaveBeenCalledTimes(3);
    expect(
      await admittedAtOnce(() =>
        a.pinterestService.getEntity("campaign", { adAccountId: SHARED_ACCOUNT }, "a-1", ctx)
      )
    ).toBe(true);
  });
});
