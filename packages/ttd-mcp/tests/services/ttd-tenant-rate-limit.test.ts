// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tenant isolation of the TTD rate limiter (#237, ttd-REST #1).
 *
 * Every HTTP tenant on an instance used to draw on one bucket, `ttd:direct-token`
 * (the adapter's constant `partnerId` label), so one tenant's bulk job queued
 * every other tenant's calls and could get their bulk batches refused. The key
 * is now per TTD credential.
 *
 * Runs real sessions exactly as the transport builds them — a real
 * `TtdDirectTokenAuthAdapter` per token, `createSessionServices`, the real
 * session store — against a limiter built like the package's (60/min, 120s
 * queue budget). Only the outbound HTTP and the confirmation prompt are faked.
 * Written against APIs that predate the fix, so it runs (and fails) on the old
 * keying too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBulkStatusChangeConfirmation: confirm };
});

import { createPlatformRateLimiter, JsonRpcErrorCode, McpError } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { TtdDirectTokenAuthAdapter } from "../../src/auth/ttd-auth-adapter.js";
import { TtdHttpClient } from "../../src/services/ttd/ttd-http-client.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
const ctx = { requestId: "req-1" } as any;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

let limiter: RateLimiter;
let fetchSpy: ReturnType<typeof vi.spyOn>;
const openSessions: string[] = [];

/** A session for `token`, built as the HTTP transport builds one. */
function openSession(sessionId: string, token: string): SessionServices {
  const services = createSessionServices(
    new TtdDirectTokenAuthAdapter(token),
    { baseUrl: "https://api.thetradedesk.com/v3" },
    logger,
    limiter
  );
  sessionServiceStore.set(sessionId, services);
  openSessions.push(sessionId);
  return services;
}

/** The key a session's calls consume from, as its bulk pre-check sees it. */
function keyOf(services: SessionServices): string {
  return services.ttdService.bulkCapacityCheck("probe", 1, [1]).buckets[0]!.key;
}

/** Fire `n` reads for a session without awaiting them: the first 60 are admitted, the rest queue. */
function backlog(services: SessionServices, n: number): void {
  for (let i = 0; i < n; i++) {
    void services.ttdService.getEntity("campaign", `c-${i}`, ctx).catch(() => {});
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  confirm.mockReset().mockResolvedValue(true);
  limiter = createPlatformRateLimiter("ttd", mcpConfig.ttdRateLimitPerMinute);
  fetchSpy = vi.spyOn(TtdHttpClient.prototype, "fetch").mockResolvedValue({});
  vi.spyOn(TtdHttpClient.prototype, "fetchDirect").mockResolvedValue({ data: {} });
});

afterEach(() => {
  limiter.destroy();
  for (const id of openSessions.splice(0)) sessionServiceStore.delete(id);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ttd rate limiting is per tenant credential", () => {
  it("tests against the package's configured limit", () => {
    expect(mcpConfig.ttdRateLimitPerMinute).toBe(60);
  });

  it("gives two tenants' sessions different buckets", () => {
    const a = openSession("s-a", "token-tenant-A");
    const b = openSession("s-b", "token-tenant-B");
    expect(keyOf(a)).not.toBe(keyOf(b));
  });

  it("keeps two sessions on the same token in one bucket (TTD counts the client, not the session)", async () => {
    const a1 = openSession("s-a1", "token-tenant-A");
    const a2 = openSession("s-a2", "token-tenant-A");
    expect(keyOf(a1)).toBe(keyOf(a2));

    await a1.ttdService.getEntity("campaign", "c-1", ctx);
    expect(limiter.getRemainingTokens(keyOf(a2))).toBe(59);
  });

  it("never puts the token in the key (rate-limit errors echo it)", () => {
    const a = openSession("s-a", "token-tenant-A-secret-value");
    expect(keyOf(a)).not.toContain("token-tenant-A-secret-value");
    expect(keyOf(a)).toMatch(/^ttd:/);
  });

  it("a tenant that fills its window does not queue another tenant's call", async () => {
    const a = openSession("s-a", "token-tenant-A");
    const b = openSession("s-b", "token-tenant-B");

    backlog(a, 60); // A's whole minute
    await vi.advanceTimersByTimeAsync(0);
    expect(limiter.getRemainingTokens(keyOf(a))).toBe(0);

    let aDone = false;
    let bDone = false;
    void a.ttdService.getEntity("campaign", "a-61", ctx).then(() => (aDone = true));
    void b.ttdService.getEntity("campaign", "b-1", ctx).then(() => (bDone = true));
    await vi.advanceTimersByTimeAsync(0);

    expect(bDone).toBe(true); // B is admitted at once
    expect(aDone).toBe(false); // A's 61st waits for its own window
    expect(limiter.getRemainingTokens(keyOf(b))).toBe(59);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(aDone).toBe(true);
  });

  it("one tenant's backlog does not get another tenant's bulk batch refused", async () => {
    const a = openSession("s-a", "token-tenant-A");
    openSession("s-b", "token-tenant-B");

    // 150 of A's calls in flight: 60 admitted, 60 queued at +60s, 30 at +120s.
    // A 50-item batch on A's bucket fits only 30 within the 120s budget.
    backlog(a, 150);
    await vi.advanceTimersByTimeAsync(0);
    const readsSentForA = fetchSpy.mock.calls.length;

    const refusedForA = await bulkUpdateStatusLogic(
      { entityType: "adGroup", entityIds: ids(50), status: "Paused" } as any,
      ctx,
      { sessionId: "s-a" } as any
    ).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(refusedForA).toBeInstanceOf(McpError);
    expect((refusedForA as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((refusedForA as McpError).data).toMatchObject({
      reason: "bulk_exceeds_capacity",
      itemsThatFit: 30,
    });

    // B's identical batch is admitted in full and runs without waiting.
    const resultForB = await bulkUpdateStatusLogic(
      { entityType: "adGroup", entityIds: ids(50), status: "Paused" } as any,
      ctx,
      { sessionId: "s-b" } as any
    );
    expect(resultForB).toMatchObject({ confirmed: true, successCount: 50, failureCount: 0 });
    expect(fetchSpy.mock.calls.length - readsSentForA).toBe(50);
  });
});
