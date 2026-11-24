// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * SnapchatService against the REAL platform limiter (#236). The service suites used to
 * inject `consume: vi.fn().mockResolvedValue(undefined)`, which can never delay
 * or reject, so a service that stopped consuming still passed. Here the limiter
 * is built by the same factory the server uses and the test observes whether
 * calls are paced or refused. Deterministic: fake timers, no real waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPlatformRateLimiter,
  executeBulkConcurrent,
  type RateLimiter,
} from "@cesteral/shared";
import { SnapchatService } from "../../src/services/snapchat/snapchat-service.js";

const LIMIT = 3;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

describe("SnapchatService rate limiting (real limiter)", () => {
  let limiter: RateLimiter;
  let get: ReturnType<typeof vi.fn>;
  let call: () => Promise<unknown>;

  function build(maxWaitMs?: number): void {
    limiter = createPlatformRateLimiter("snapchat", LIMIT, { maxWaitMs });
    get = vi.fn().mockResolvedValue({ items: [] });
    const service = new SnapchatService(
      { quotaPrincipal: "user:u-1", get } as any,
      "org_123",
      "acct_456",
      limiter
    );
    call = () => service.getMedia("m-1");
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
    for (let i = 0; i < LIMIT; i++) await call();
    expect(get).toHaveBeenCalledTimes(LIMIT);

    const over = call();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(get).toHaveBeenCalledTimes(LIMIT); // still queued, nothing sent

    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(get).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("refuses calls beyond capacity per item, sending nothing upstream for them", async () => {
    // maxWaitMs 0: a call beyond capacity is refused instead of queued.
    build(0);
    const results = await executeBulkConcurrent([1, 2, 3, 4, 5], () => call(), {
      concurrency: 5,
    });

    expect(results.map((r) => r.success)).toEqual([true, true, true, false, false]);
    expect(results[3]!.error).toMatch(/rate limit/i);
    expect(get).toHaveBeenCalledTimes(LIMIT);
  });
});
