// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tenant isolation of the Meta rate limiter (#237, meta #10).
 *
 * Every call not addressed to a named ad account used to draw on one bucket,
 * `meta:default`, shared by every HTTP tenant on an instance, so one tenant's
 * bulk job queued every other tenant's calls and could get their bulk batches
 * refused. The buckets are now the session's Graph user's (the `/me` id).
 * Account-scoped calls keyed the raw `adAccountId`, so `act_123` and `123` were
 * two buckets for one account (#236); that is normalized too.
 *
 * Runs real sessions as the transport builds them — a real
 * `MetaAccessTokenAdapter` per token (validated against a stubbed `GET /me`
 * that answers a different user id per token), `createSessionServices`, the
 * real session store and the package's real process-wide limiter (20/min,
 * 120s queue budget), which the bulk pre-check reads. Only the Graph calls and
 * the confirmation prompt are faked. Written against APIs that predate the fix,
 * so it runs (and fails) on the old keying too.
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
import { MetaAccessTokenAdapter } from "../../src/auth/meta-auth-adapter.js";
import { MetaGraphApiClient } from "../../src/services/meta/meta-graph-api-client.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

const logger = pino({ level: "silent" });
const ctx = { requestId: "req-1" } as any;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `2345678901234${i}`);

/** `GET /me` answers a user id derived from the bearer token. */
const USER_IDS: Record<string, string> = {
  "token-tenant-A": "1001",
  "token-tenant-A-second": "1001",
  "token-tenant-B": "2002",
};

let postSpy: ReturnType<typeof vi.spyOn>;
const openSessions: string[] = [];

async function openSession(sessionId: string, token: string): Promise<SessionServices> {
  const adapter = new MetaAccessTokenAdapter(token, mcpConfig.metaApiBaseUrl);
  await adapter.validate();
  const services = createSessionServices(
    adapter,
    { baseUrl: mcpConfig.metaApiBaseUrl },
    logger,
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  openSessions.push(sessionId);
  return services;
}

/** Fire `n` node reads without awaiting them: the first 20 are admitted, the rest queue. */
function backlog(services: SessionServices, n: number): void {
  for (let i = 0; i < n; i++) {
    void services.metaService.getEntity("campaign", `c-${i}`, undefined, ctx).catch(() => {});
  }
}

beforeEach(async () => {
  confirm.mockReset().mockResolvedValue(true);
  rateLimiter.clear();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const token = auth.replace(/^Bearer /, "");
    return new Response(JSON.stringify({ id: USER_IDS[token], name: "u" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.spyOn(MetaGraphApiClient.prototype, "get").mockResolvedValue({ id: "x", name: "n" });
  postSpy = vi.spyOn(MetaGraphApiClient.prototype, "post").mockResolvedValue({ success: true });
});

afterEach(() => {
  for (const id of openSessions.splice(0)) sessionServiceStore.delete(id);
  rateLimiter.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("meta rate limiting is per tenant (Graph user)", () => {
  it("tests against the package's configured limit", () => {
    expect(mcpConfig.metaRateLimitPerMinute).toBe(20);
  });

  it("a tenant that fills its window does not queue another tenant's call", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    const b = await openSession("s-b", "token-tenant-B");
    vi.useFakeTimers();

    backlog(a, 20); // A's whole minute
    await vi.advanceTimersByTimeAsync(0);

    let aDone = false;
    let bDone = false;
    void a.metaService.getEntity("campaign", "a-21", undefined, ctx).then(() => (aDone = true));
    void b.metaService.getEntity("campaign", "b-1", undefined, ctx).then(() => (bDone = true));
    await vi.advanceTimersByTimeAsync(0);

    expect(bDone).toBe(true); // B is admitted at once
    expect(aDone).toBe(false); // A's 21st waits for its own window

    await vi.advanceTimersByTimeAsync(60_000);
    expect(aDone).toBe(true);
  });

  it("two sessions of one Graph user share a bucket (Meta counts the user, not the session)", async () => {
    const a1 = await openSession("s-a1", "token-tenant-A");
    const a2 = await openSession("s-a2", "token-tenant-A-second");
    vi.useFakeTimers();

    backlog(a1, 20);
    await vi.advanceTimersByTimeAsync(0);

    let done = false;
    void a2.metaService.getEntity("campaign", "a2-1", undefined, ctx).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).toBe(true);
  });

  it("one tenant's backlog does not get another tenant's bulk batch refused", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    await openSession("s-b", "token-tenant-B");
    vi.useFakeTimers();

    // 60 of A's reads in flight: 20 admitted now, 20 at +60s, 20 at +120s, so
    // A's window is full through the whole 120s budget.
    backlog(a, 60);
    await vi.advanceTimersByTimeAsync(0);

    const refusedForA = await bulkUpdateStatusLogic(
      { entityIds: ids(6), status: "PAUSED" } as any,
      ctx,
      { sessionId: "s-a" } as any
    ).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(refusedForA).toBeInstanceOf(McpError);
    expect((refusedForA as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((refusedForA as McpError).data).toMatchObject({ reason: "bulk_exceeds_capacity" });

    // B's identical batch is admitted in full and runs without waiting.
    const resultForB = await bulkUpdateStatusLogic(
      { entityIds: ids(6), status: "PAUSED" } as any,
      ctx,
      { sessionId: "s-b" } as any
    );
    expect(resultForB).toMatchObject({ confirmed: true, successCount: 6, failureCount: 0 });
    expect(postSpy).toHaveBeenCalledTimes(6);
  });

  it("`act_{id}` and a bare `{id}` are one ad-account bucket", async () => {
    const a = await openSession("s-a", "token-tenant-A");
    vi.useFakeTimers();

    // Six creates (3 tokens each) on the bare id leave 2 of 20 tokens…
    for (let i = 0; i < 6; i++) {
      await a.metaService.createEntity("campaign", "123", { name: `c${i}` }, ctx);
    }
    // …so a 3-token create on the prefixed id must wait for the window.
    let done = false;
    void a.metaService
      .createEntity("campaign", "act_123", { name: "c6" }, ctx)
      .then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).toBe(true);
  });
});
