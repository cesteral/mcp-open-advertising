// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `TikTokService` and `TikTokReportingService` against a REAL platform limiter
 * (#236). The service suites spy on `consume`, which cannot show that a call
 * past capacity is delayed; this one does, deterministically: fake timers, no
 * real waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { TikTokService } from "../../src/services/tiktok/tiktok-service.js";
import { TikTokReportingService } from "../../src/services/tiktok/tiktok-reporting-service.js";

const LIMIT = 2;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

describe("TikTok rate limiting (real limiter)", () => {
  let limiter: RateLimiter;
  let httpClient: { get: ReturnType<typeof vi.fn>; quotaClient: string };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    limiter = createPlatformRateLimiter("tiktok", LIMIT);
    httpClient = {
      get: vi.fn().mockResolvedValue({ list: [], page_info: {} }),
      quotaClient: "0123456789abcdef",
    };
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("delays a CRUD call beyond the per-token capacity until the window refills", async () => {
    const service = new TikTokService(limiter, httpClient as any, logger);
    for (let i = 0; i < LIMIT; i++) await service.listEntities("campaign");
    expect(httpClient.get).toHaveBeenCalledTimes(LIMIT);

    const over = service.listEntities("campaign");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(httpClient.get).toHaveBeenCalledTimes(LIMIT);
    await vi.advanceTimersByTimeAsync(1);
    await over;
    expect(httpClient.get).toHaveBeenCalledTimes(LIMIT + 1);
  });

  it("draws reporting calls from their own bucket, not the CRUD one", async () => {
    const service = new TikTokService(limiter, httpClient as any, logger);
    const reporting = new TikTokReportingService(limiter, httpClient as any, logger);
    for (let i = 0; i < LIMIT; i++) await service.listEntities("campaign");
    expect(limiter.getRemainingTokens("tiktok:token:0123456789abcdef")).toBe(0);

    httpClient.get.mockResolvedValueOnce({ status: "QUEUING", task_id: "t" });
    await reporting.checkReportStatus("t");

    expect(limiter.getRemainingTokens("tiktok:token:0123456789abcdef:reporting")).toBe(LIMIT - 1);
  });
});
