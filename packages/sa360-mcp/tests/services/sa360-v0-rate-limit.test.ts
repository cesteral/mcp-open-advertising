// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `SA360Service` (Reporting API v0 reads) against a REAL platform limiter
 * (#236). The service suites used an always-resolving `consume` mock, which
 * cannot show that a read past capacity is delayed. Companion to
 * sa360-v2-rate-limit.test.ts, which covers the v2 services.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { SA360Service } from "../../src/services/sa360/sa360-service.js";

const LIMIT = 2;

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: "debug",
} as any;

describe("SA360Service v0 rate limiting (real limiter)", () => {
  let limiter: RateLimiter;
  let httpClient: { fetch: ReturnType<typeof vi.fn> };
  let service: SA360Service;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    limiter = createPlatformRateLimiter("sa360", LIMIT);
    httpClient = { fetch: vi.fn().mockResolvedValue({ results: [] }) };
    service = new SA360Service(logger, limiter, httpClient as any);
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("delays a search beyond the per-customer capacity until the window refills", async () => {
    for (let i = 0; i < LIMIT; i++)
      await service.sa360Search("111", "SELECT campaign.id FROM campaign");
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);
    expect(limiter.getRemainingTokens("sa360:111")).toBe(0);

    const over = service.sa360Search("111", "SELECT campaign.id FROM campaign");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("keeps a separate bucket per customer", async () => {
    for (let i = 0; i < LIMIT; i++)
      await service.sa360Search("111", "SELECT campaign.id FROM campaign");

    await service.sa360Search("222", "SELECT campaign.id FROM campaign");

    expect(httpClient.fetch).toHaveBeenCalledTimes(LIMIT + 1);
    expect(limiter.getRemainingTokens("sa360:222")).toBe(LIMIT - 1);
  });
});
