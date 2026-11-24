// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { afterEach, vi } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";

const spied: RateLimiter[] = [];
afterEach(() => {
  for (const l of spied.splice(0)) l.destroy();
});

/**
 * The REAL `ttd:*` platform limiter with `consume` spied, for service suites
 * that assert which key a call drew on (#236). Unlike an always-resolving
 * `consume: vi.fn()` mock it can still delay or refuse a call past capacity.
 * `limitPerMinute` defaults high so a suite that is not about throttling never
 * waits; it is destroyed after each test.
 */
export function createSpiedTtdRateLimiter(limitPerMinute = 10_000): RateLimiter {
  const limiter = createPlatformRateLimiter("ttd", limitPerMinute);
  vi.spyOn(limiter, "consume");
  spied.push(limiter);
  return limiter;
}
