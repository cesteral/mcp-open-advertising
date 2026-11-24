// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `GAdsService.gaqlSearch` against a REAL platform limiter (#236). The service suites
 * used an always-resolving `consume` mock, which cannot show that a call past
 * capacity is delayed. Fake timers; ordering is by promise, not wall clock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSpiedRateLimiter } from "../helpers/spied-rate-limiter.js";
import { GAdsService } from "../../src/services/gads/gads-service.js";

const LIMIT = 2;

describe("GAdsService rate limiting (real limiter)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    return () => vi.useRealTimers();
  });

  it("delays a search beyond the per-customer capacity until the window refills", async () => {
    const limiter = createSpiedRateLimiter(LIMIT);
    const sent = vi.fn().mockResolvedValue({ results: [] });
    const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const httpClient: any = { fetch: sent, developerToken: "d", loginCustomerId: undefined };
    const service = new GAdsService(logger, limiter, httpClient);
    const call = () => service.gaqlSearch("customer-abc", "SELECT campaign.id FROM campaign");
    for (let i = 0; i < LIMIT; i++) await call();
    expect(sent).toHaveBeenCalledTimes(LIMIT);
    expect(limiter.getRemainingTokens("gads:customer-abc")).toBe(0);

    const over = call();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(sent).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(sent).toHaveBeenCalledTimes(LIMIT + 1);
  });
});
