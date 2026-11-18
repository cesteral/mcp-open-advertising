// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * MsAdsService against the REAL platform limiter (#236). The service suites
 * used to inject `consume: vi.fn().mockResolvedValue(undefined)`, which can
 * never delay or reject, so a service that stopped consuming (or consumed the
 * wrong key) still passed. Here the limiter is built by the same factory the
 * server uses and the test observes whether calls are paced or refused.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pino from "pino";
import {
  createPlatformRateLimiter,
  executeBulkConcurrent,
  type RateLimiter,
} from "@cesteral/shared";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";

const LIMIT = 3;
const logger = pino({ level: "silent" });

describe("MsAdsService rate limiting (real limiter)", () => {
  let limiter: RateLimiter;
  let post: ReturnType<typeof vi.fn>;
  let service: MsAdsService;

  function build(maxWaitMs?: number): void {
    limiter = createPlatformRateLimiter("msads", LIMIT, { maxWaitMs });
    post = vi.fn().mockResolvedValue({});
    service = new MsAdsService(limiter, { post } as unknown as MsAdsHttpClient, logger, {
      userId: "u1",
      customerId: "c1",
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("delays a call beyond capacity until the window frees a token", async () => {
    build();
    for (let i = 0; i < LIMIT; i++) await service.executeReadOperation("/Accounts/Search", {});
    expect(post).toHaveBeenCalledTimes(LIMIT);

    const over = service.executeReadOperation("/Accounts/Search", {});
    await vi.advanceTimersByTimeAsync(59_999);
    expect(post).toHaveBeenCalledTimes(LIMIT); // still queued, nothing sent

    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(post).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("makes a mid-batch rejection visible per item, and sends nothing for the refused ones", async () => {
    // maxWaitMs 0: a call beyond capacity is refused instead of queued.
    build(0);
    const items = [1, 2, 3, 4, 5];

    const results = await executeBulkConcurrent(
      items,
      (n) => service.executeReadOperation("/Accounts/Search", { n }),
      { concurrency: 5 }
    );

    expect(results.map((r) => r.success)).toEqual([true, true, true, false, false]);
    expect(results[3]!.error).toMatch(/rate limit/i);
    expect(post).toHaveBeenCalledTimes(LIMIT);
  });
});
