// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `AmazonDspService` reads against a REAL platform limiter (#236). The service suites
 * used an always-resolving `consume` mock, which cannot show that a call past
 * capacity is delayed. Fake timers; ordering is by promise, not wall clock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSpiedRateLimiter } from "../helpers/spied-rate-limiter.js";
import { AmazonDspService } from "../../src/services/amazon-dsp/amazon-dsp-service.js";

const LIMIT = 2;

describe("AmazonDspService rate limiting (real limiter)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    return () => vi.useRealTimers();
  });

  it("delays a read beyond capacity until the window refills", async () => {
    const limiter = createSpiedRateLimiter(LIMIT);
    const sent = vi.fn().mockResolvedValue({ campaigns: [] });
    const service = new AmazonDspService(limiter, { post: sent } as any);
    const call = () => service.listEntities("order", "5550001112223", {});
    for (let i = 0; i < LIMIT; i++) await call();
    expect(sent).toHaveBeenCalledTimes(LIMIT);
    expect(limiter.getRemainingTokens("amazon_dsp:read")).toBe(0);

    const over = call();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(sent).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(sent).toHaveBeenCalledTimes(LIMIT + 1);
  });
});
