// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `LinkedInReportingService` analytics reads against a REAL platform limiter (#236). The service suites
 * used an always-resolving `consume` mock, which cannot show that a call past
 * capacity is delayed. Fake timers; ordering is by promise, not wall clock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSpiedRateLimiter } from "../helpers/spied-rate-limiter.js";
import { LinkedInReportingService } from "../../src/services/linkedin/linkedin-reporting-service.js";

const LIMIT = 2;

describe("LinkedInReportingService rate limiting (real limiter)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    return () => vi.useRealTimers();
  });

  it("delays an analytics call beyond the per-account capacity until the window refills", async () => {
    const limiter = createSpiedRateLimiter(LIMIT);
    const sent = vi.fn().mockResolvedValue({ elements: [] });
    const service = new LinkedInReportingService(limiter, { get: sent } as any);
    const account = "urn:li:sponsoredAccount:123";
    const call = () =>
      service.getAnalytics(
        account,
        { start: "2026-03-01", end: "2026-03-04" },
        ["impressions"],
        "CAMPAIGN",
        "DAILY"
      );
    for (let i = 0; i < LIMIT; i++) await call();
    expect(sent).toHaveBeenCalledTimes(LIMIT);
    expect(limiter.getRemainingTokens("linkedin:urn:li:sponsoredAccount:123")).toBe(0);

    const over = call();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(sent).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(sent).toHaveBeenCalledTimes(LIMIT + 1);
  });
});
