// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The real `amazon_dsp:*` limiter with `consume` spied (#236), for service suites
 * that assert which key and cost a call consumed. Unlike an always-resolving
 * `consume: vi.fn()` mock it can still delay or refuse a call past capacity.
 * It uses the package's configured per-minute limit and the shared two-window
 * queue budget, a fresh instance per call so one test's spent tokens never
 * throttle the next, and is destroyed after each test.
 */

import { vi, afterEach } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";

const spied: RateLimiter[] = [];
afterEach(() => {
  for (const l of spied.splice(0)) l.destroy();
});

export function createSpiedRateLimiter(
  requestsPerMinute: number = mcpConfig.amazonDspRateLimitPerMinute
): RateLimiter {
  const limiter = createPlatformRateLimiter("amazon_dsp", requestsPerMinute);
  vi.spyOn(limiter, "consume");
  spied.push(limiter);
  return limiter;
}
