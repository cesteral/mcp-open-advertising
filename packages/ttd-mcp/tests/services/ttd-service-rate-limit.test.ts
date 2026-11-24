// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `TtdService` against a REAL platform limiter (#236). The service suites
 * spy on `consume`, which cannot show that a call past capacity is delayed;
 * this one does, deterministically: fake timers, no real waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { TtdService } from "../../src/services/ttd/ttd-service.js";

const LIMIT = 2;
const KEY = "ttd:client:test-client";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

describe("TtdService rate limiting (real limiter)", () => {
  let limiter: RateLimiter;
  let httpClient: { fetch: ReturnType<typeof vi.fn>; quotaClient: string };
  let service: TtdService;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    limiter = createPlatformRateLimiter("ttd", LIMIT);
    httpClient = { fetch: vi.fn().mockResolvedValue({}), quotaClient: "test-client" };
    service = new TtdService(logger, limiter, httpClient as any);
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("delays a call beyond the per-client capacity until the window refills", async () => {
    for (let i = 0; i < LIMIT; i++) await service.getEntity("campaign", `c-${i}`);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);
    expect(limiter.getRemainingTokens(KEY)).toBe(0);

    const over = service.getEntity("campaign", "c-over");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("keeps a separate bucket per client", async () => {
    for (let i = 0; i < LIMIT; i++) await service.getEntity("campaign", `c-${i}`);

    const other = new TtdService(logger, limiter, {
      fetch: vi.fn().mockResolvedValue({}),
      quotaClient: "other-client",
    } as any);
    await other.getEntity("campaign", "c-x");

    expect(limiter.getRemainingTokens("ttd:client:other-client")).toBe(LIMIT - 1);
  });
});
