// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Rate Limiter — shared across all Cesteral MCP servers
 *
 * In-memory sliding window rate limiter with wildcard pattern support.
 * Each server configures its own limits (e.g., "dv360:*" or "bidmanager:*").
 *
 * QUEUEING, NOT FAIL-FAST
 *
 * When a key's window is full, `consume` WAITS until the window has room, as
 * long as that wait is within the limit's `maxWaitMs`; only a wait longer than
 * that (or a request that can never fit, `tokens > limit`) is rejected with
 * `RateLimited`. Failing fast was the old behaviour and it was wrong for this
 * fleet: bulk tools fan out per item through `executeBulkConcurrent`, which
 * records per-item errors and carries on, so a limiter that threw after the
 * first few items left the platform with half a batch applied inside what
 * governance treats as one effect.
 *
 * Waiting is FIFO per key and cannot overshoot: each caller reserves its
 * admission time up front, computed against every earlier reservation, so N
 * concurrent callers are admitted at N distinct, pre-computed instants rather
 * than all waking together and racing for the same slot. A reservation is
 * never moved, so a later caller cannot delay an earlier one.
 *
 * `new RateLimiter()` keeps `maxWaitMs = 0` (reject instead of queueing) unless
 * told otherwise, so a caller that configures a bare limiter gets the old,
 * immediate behaviour. The fleet's servers are built with
 * {@link createPlatformRateLimiter}, which queues for up to two windows
 * ({@link PLATFORM_RATE_LIMIT_MAX_WAIT_MS}).
 */

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";
import { recordRateLimitHit } from "./metrics.js";

const CLEANUP_INTERVAL_MS = 300_000;
const TIMESTAMP_GC_AGE_MS = 3_600_000;

/** Per-limit options. */
export interface RateLimitOptions {
  /**
   * The longest `consume` will wait for capacity, in ms, INCLUDING time spent
   * behind earlier queued callers on the same key. A call whose admission would
   * be further away than this is rejected immediately with `RateLimited`
   * (nothing is reserved for it). `0` disables queueing.
   */
  maxWaitMs?: number;
}

export interface RateLimiterOptions {
  /** `maxWaitMs` for limits configured without one. Default `0` (no queueing). */
  defaultMaxWaitMs?: number;
}

/** A configured limit, as published by {@link RateLimiter.describeLimits}. */
export interface RateLimitDescription {
  pattern: string;
  limit: number;
  windowMs: number;
  /** How long a caller is queued before being rejected. `0` = rejected at once. */
  maxWaitMs: number;
}

interface LimitConfig {
  limit: number;
  windowMs: number;
  maxWaitMs: number;
}

interface PendingWait {
  timer: NodeJS.Timeout;
  reject: (err: unknown) => void;
}

function assertNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`RateLimiter: ${name} must be a finite number >= 0 (got ${value})`);
  }
}

/**
 * Sliding window rate limiter with automatic cleanup.
 */
export class RateLimiter {
  /**
   * Per key, the admission instant of every token still inside its window,
   * ascending. Entries in the FUTURE are reservations held by queued callers.
   */
  private readonly requests: Map<string, number[]> = new Map();
  private readonly limits: Map<string, LimitConfig> = new Map();
  private readonly compiledPatterns: Map<string, RegExp> = new Map();
  private readonly pending: Set<PendingWait> = new Set();
  private readonly defaultMaxWaitMs: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: RateLimiterOptions = {}) {
    this.defaultMaxWaitMs = options.defaultMaxWaitMs ?? 0;
    assertNonNegativeFinite("defaultMaxWaitMs", this.defaultMaxWaitMs);
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref();
  }

  /**
   * Configure rate limit for a key pattern
   * @param keyPattern Pattern to match (e.g., "dv360:*" for all DV360 requests)
   * @param limit Number of requests allowed
   * @param windowMs Time window in milliseconds
   * @param options `maxWaitMs` — how long a caller may be queued (see {@link RateLimitOptions})
   */
  configure(
    keyPattern: string,
    limit: number,
    windowMs: number,
    options: RateLimitOptions = {}
  ): void {
    const maxWaitMs = options.maxWaitMs ?? this.defaultMaxWaitMs;
    assertNonNegativeFinite("maxWaitMs", maxWaitMs);
    this.limits.set(keyPattern, { limit, windowMs, maxWaitMs });

    if (keyPattern.includes("*") && keyPattern !== "*") {
      const regexSource = keyPattern
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      this.compiledPatterns.set(keyPattern, new RegExp(`^${regexSource}$`));
    }
  }

  /**
   * Consume tokens from the rate limit bucket, waiting for capacity if needed.
   *
   * Resolves once the tokens are admitted — immediately when the window has
   * room, otherwise after queueing (FIFO per key) for at most the limit's
   * `maxWaitMs`.
   *
   * @param key Unique identifier for the resource (e.g., "dv360:advertiserId")
   * @param tokens Number of tokens to consume (default: 1)
   * @throws McpError(RateLimited) when `tokens` exceeds the limit (it can never
   *   be admitted), or when admission is further away than `maxWaitMs`. In the
   *   latter case `data.retryAfterMs` is how far away admission was.
   * @throws McpError(ServiceUnavailable) when the limiter is destroyed while
   *   the caller is queued.
   */
  async consume(key: string, tokens: number = 1): Promise<void> {
    const now = Date.now();

    const match = this.findLimitConfig(key);
    if (!match) {
      return;
    }

    const { pattern, config } = match;
    const { limit, windowMs, maxWaitMs } = config;

    if (tokens > limit) {
      recordRateLimitHit(pattern);
      throw new McpError(
        JsonRpcErrorCode.RateLimited,
        `Rate limit exceeded for ${key}: the request needs ${tokens} tokens but the limit is ` +
          `${limit} per ${windowMs}ms, so it can never be admitted.`,
        { key, limit, windowMs, maxWaitMs, tokens, reason: "tokens_exceed_limit" }
      );
    }

    const timestamps = (this.requests.get(key) ?? []).filter((ts) => now - ts < windowMs);
    const admitAt = RateLimiter.earliestAdmission(timestamps, now, limit, windowMs, tokens);
    const waitMs = admitAt - now;

    if (waitMs > maxWaitMs) {
      // Not reserved: a rejected caller must not hold a slot it will never use.
      this.requests.set(key, timestamps);
      const retryAfterSeconds = Math.ceil(waitMs / 1000);
      recordRateLimitHit(pattern);
      throw new McpError(
        JsonRpcErrorCode.RateLimited,
        `Rate limit exceeded for ${key}. Retry after ${retryAfterSeconds} seconds ` +
          `(admission is ${waitMs}ms away; this limiter queues for at most ${maxWaitMs}ms).`,
        {
          key,
          limit,
          windowMs,
          maxWaitMs,
          tokens,
          retryAfterMs: waitMs,
          retryAfterSeconds,
          reason: "wait_exceeds_max",
        }
      );
    }

    for (let i = 0; i < tokens; i++) {
      timestamps.push(admitAt);
    }
    this.requests.set(key, timestamps);

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }

  /**
   * The earliest instant `tokens` more tokens fit in the window, given the
   * ascending admission instants already recorded or reserved for the key.
   *
   * Never earlier than the last reservation (FIFO: `timestamps` stays sorted
   * and no caller can be placed ahead of one already queued). With `n` entries,
   * at most `limit - tokens` may still be inside the window at admission, so
   * entry `n - (limit - tokens) - 1` must have expired: admission is that
   * entry's instant plus one window.
   */
  private static earliestAdmission(
    timestamps: number[],
    now: number,
    limit: number,
    windowMs: number,
    tokens: number
  ): number {
    let admitAt = Math.max(now, timestamps[timestamps.length - 1] ?? now);
    const mustExpire = timestamps.length - (limit - tokens) - 1;
    if (mustExpire >= 0) {
      admitAt = Math.max(admitAt, timestamps[mustExpire]! + windowMs);
    }
    return admitAt;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const wait: PendingWait = {
        timer: setTimeout(() => {
          this.pending.delete(wait);
          resolve();
        }, ms),
        reject,
      };
      this.pending.add(wait);
    });
  }

  /**
   * The limits this instance is configured with, as
   * `{ pattern, limit, windowMs, maxWaitMs }`.
   *
   * Exists so the server card can publish the rate limit a client will actually
   * hit (#201) by reading the LIVE limiter the transport was handed, rather than
   * a second copy declared in metadata. A declared limit that drifts from the
   * configured one is worse than publishing nothing, because a client will pace
   * itself against a number we are not enforcing.
   *
   * Per-process, like the limiter itself — see {@link createPlatformRateLimiter}
   * for the multi-instance caveat that makes this a floor, not a guarantee.
   *
   * `maxWaitMs` is published alongside the cap because it changes what a
   * client sees when it exceeds it: a queued (slower) call rather than an
   * immediate `RateLimited`.
   */
  describeLimits(): RateLimitDescription[] {
    return [...this.limits.entries()].map(([pattern, { limit, windowMs, maxWaitMs }]) => ({
      pattern,
      limit,
      windowMs,
      maxWaitMs,
    }));
  }

  /**
   * Tokens that could be admitted for a key right now without queueing.
   * Reservations held by queued callers count as consumed.
   */
  getRemainingTokens(key: string): number {
    const now = Date.now();
    const match = this.findLimitConfig(key);

    if (!match) {
      return Infinity;
    }

    const { limit, windowMs } = match.config;
    const timestamps = this.requests.get(key) || [];
    const activeTimestamps = timestamps.filter((ts) => now - ts < windowMs);

    return Math.max(0, limit - activeTimestamps.length);
  }

  /**
   * Reset rate limit for a key. Callers already queued keep their admission
   * time; only callers arriving afterwards see the emptied window.
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limit data. As with {@link reset}, queued callers are not
   * woken early.
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * The limit governing `key`, with the pattern that matched it (the metric
   * label — a bounded set, unlike keys carrying account ids).
   */
  private findLimitConfig(key: string): { pattern: string; config: LimitConfig } | undefined {
    const exact = this.limits.get(key);
    if (exact) {
      return { pattern: key, config: exact };
    }

    for (const [pattern, config] of this.limits.entries()) {
      if (this.matchPattern(key, pattern)) {
        return { pattern, config };
      }
    }

    return undefined;
  }

  private matchPattern(key: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (!pattern.includes("*")) {
      return key === pattern;
    }

    const cached = this.compiledPatterns.get(pattern);
    if (cached) {
      return cached.test(key);
    }

    const regexSource = pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${regexSource}$`).test(key);
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter((ts) => now - ts < TIMESTAMP_GC_AGE_MS);

      if (filtered.length === 0) {
        this.requests.delete(key);
      } else if (filtered.length < timestamps.length) {
        this.requests.set(key, filtered);
      }
    }
  }

  /**
   * Destroy the rate limiter and stop cleanup interval.
   * Call this when shutting down the application.
   *
   * Callers still queued in `consume` are rejected with `ServiceUnavailable`
   * and their timers cleared, so a destroyed limiter holds no timers and no
   * promise that will never settle.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    const pending = [...this.pending];
    this.pending.clear();
    for (const wait of pending) {
      clearTimeout(wait.timer);
      wait.reject(
        new McpError(
          JsonRpcErrorCode.ServiceUnavailable,
          "Rate limiter was shut down while the request was queued; it was not sent."
        )
      );
    }
    this.requests.clear();
    this.limits.clear();
    this.compiledPatterns.clear();
  }
}

/** The sliding window every platform limiter uses. */
export const PLATFORM_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Default queue budget for platform limiters: TWO windows.
 *
 * One window is enough for a lone caller (its admission is never more than a
 * window away), but not for a bulk tool. `executeBulkConcurrent` keeps 5 items
 * in flight, and 3-token writes put up to 4 × 3 = 12 tokens queued ahead of an
 * item — more than a whole 10/min window. Measured with the real limiter and
 * executor on a 50-item batch: at one window, 10/min × 3-token servers
 * (amazon-dsp, linkedin, pinterest, snapchat, tiktok) still rejected 17 of 50
 * items mid-batch; at two windows every current default config completes all
 * 50. The longer budget only applies to callers queued behind others.
 */
export const PLATFORM_RATE_LIMIT_MAX_WAIT_MS = 2 * PLATFORM_RATE_LIMIT_WINDOW_MS;

/**
 * Create a pre-configured rate limiter for a named platform.
 *
 * @param platformName Short platform identifier (e.g., "bidmanager", "dv360")
 * @param requestsPerMinute Sliding-window request cap
 * @param options `maxWaitMs` — how long a call may be queued for capacity before
 *   it is rejected. Defaults to {@link PLATFORM_RATE_LIMIT_MAX_WAIT_MS} (two
 *   windows), so a call is only rejected when the callers queued ahead of it
 *   already hold more than two windows of admissions.
 * @returns Configured RateLimiter instance ready for use
 *
 * Every consume key must match `${platformName}:*` — a key without the
 * `platformName:` prefix is silently unlimited. `scripts/lib/rate-limit-keys.test.mjs`
 * ratchets that for literal keys in `packages/<pkg>/src`.
 *
 * **Multi-instance caveat:** Rate limiting is per-process. When running multiple
 * instances (e.g., Cloud Run auto-scaling), the effective limit is
 * `configured_limit × instance_count`. Server defaults are set conservatively
 * assuming 10 instances. Override via environment variables for different scaling profiles.
 *
 * @example
 *   export const rateLimiter = createPlatformRateLimiter("bidmanager", 10);
 */
export function createPlatformRateLimiter(
  platformName: string,
  requestsPerMinute: number,
  options: RateLimitOptions = {}
): RateLimiter {
  const limiter = new RateLimiter();
  limiter.configure(`${platformName}:*`, requestsPerMinute, PLATFORM_RATE_LIMIT_WINDOW_MS, {
    maxWaitMs: options.maxWaitMs ?? PLATFORM_RATE_LIMIT_MAX_WAIT_MS,
  });
  return limiter;
}
