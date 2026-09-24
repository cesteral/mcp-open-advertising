import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/utils/metrics.js", () => ({ recordRateLimitHit: vi.fn() }));

import {
  RateLimiter,
  createPlatformRateLimiter,
  PLATFORM_RATE_LIMIT_WINDOW_MS,
  PLATFORM_RATE_LIMIT_MAX_WAIT_MS,
} from "../../src/utils/rate-limiter.js";
import { executeBulkConcurrent } from "../../src/utils/bulk-executor.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/mcp-errors.js";
import { recordRateLimitHit } from "../../src/utils/metrics.js";

/** Track when (fake time) each promise settles, and how. */
function track(p: Promise<void>) {
  const state: { settledAt?: number; error?: unknown } = {};
  p.then(
    () => {
      state.settledAt = Date.now();
    },
    (err) => {
      state.settledAt = Date.now();
      state.error = err;
    }
  );
  return state;
}

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    limiter = new RateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  describe("basic rate limiting", () => {
    it("allows requests up to the configured limit", async () => {
      limiter.configure("api:test", 3, 60_000);

      await expect(limiter.consume("api:test")).resolves.toBeUndefined();
      await expect(limiter.consume("api:test")).resolves.toBeUndefined();
      await expect(limiter.consume("api:test")).resolves.toBeUndefined();
    });

    it("throws McpError when limit is exceeded", async () => {
      limiter.configure("api:test", 2, 60_000);

      await limiter.consume("api:test");
      await limiter.consume("api:test");

      try {
        await limiter.consume("api:test");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpError);
        expect((err as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
        expect((err as McpError).message).toContain("Rate limit exceeded");
        expect((err as McpError).data).toMatchObject({
          key: "api:test",
          limit: 2,
          windowMs: 60_000,
        });
      }
    });

    it("allows consuming multiple tokens at once", async () => {
      limiter.configure("api:test", 5, 60_000);

      await expect(limiter.consume("api:test", 3)).resolves.toBeUndefined();
      await expect(limiter.consume("api:test", 2)).resolves.toBeUndefined();
      await expect(limiter.consume("api:test", 1)).rejects.toThrow(McpError);
    });

    it("does nothing if no limit is configured for a key", async () => {
      await expect(limiter.consume("unknown:key")).resolves.toBeUndefined();
    });
  });

  describe("sliding window", () => {
    it("allows new requests after old ones expire", async () => {
      limiter.configure("api:test", 2, 10_000);

      await limiter.consume("api:test");
      await limiter.consume("api:test");
      await expect(limiter.consume("api:test")).rejects.toThrow(McpError);

      vi.advanceTimersByTime(10_001);
      await expect(limiter.consume("api:test")).resolves.toBeUndefined();
    });

    it("partially expires old timestamps (sliding, not tumbling)", async () => {
      limiter.configure("api:test", 2, 10_000);

      await limiter.consume("api:test");
      vi.advanceTimersByTime(5_000);
      await limiter.consume("api:test");
      await expect(limiter.consume("api:test")).rejects.toThrow(McpError);

      vi.advanceTimersByTime(5_001);
      await expect(limiter.consume("api:test")).resolves.toBeUndefined();
      await expect(limiter.consume("api:test")).rejects.toThrow(McpError);
    });
  });

  describe("wildcard pattern matching", () => {
    it("matches wildcard pattern to keys with matching prefix", async () => {
      limiter.configure("dv360:*", 2, 60_000);

      await limiter.consume("dv360:123");
      await limiter.consume("dv360:123");
      await expect(limiter.consume("dv360:123")).rejects.toThrow(McpError);
    });

    it("matches the universal wildcard * to any key", async () => {
      limiter.configure("*", 1, 60_000);

      await limiter.consume("anything:here");
      await expect(limiter.consume("anything:here")).rejects.toThrow(McpError);
    });

    it("does NOT match wildcard pattern to non-matching prefix", async () => {
      limiter.configure("dv360:*", 1, 60_000);

      await expect(limiter.consume("ttd:123")).resolves.toBeUndefined();
      await expect(limiter.consume("ttd:123")).resolves.toBeUndefined();
    });

    it("handles multi-wildcard patterns", async () => {
      limiter.configure("prefix:*:suffix", 1, 60_000);

      await limiter.consume("prefix:middle:suffix");
      await expect(limiter.consume("prefix:middle:suffix")).rejects.toThrow(McpError);
    });
  });

  describe("exact match priority", () => {
    it("prefers exact match over pattern match", async () => {
      limiter.configure("dv360:*", 10, 60_000);
      limiter.configure("dv360:special", 1, 60_000);

      await limiter.consume("dv360:special");
      await expect(limiter.consume("dv360:special")).rejects.toThrow(McpError);
    });
  });

  describe("getRemainingTokens", () => {
    it("returns the full limit when no tokens consumed", () => {
      limiter.configure("api:test", 5, 60_000);
      expect(limiter.getRemainingTokens("api:test")).toBe(5);
    });

    it("returns correct remaining count after consumption", async () => {
      limiter.configure("api:test", 5, 60_000);
      await limiter.consume("api:test");
      await limiter.consume("api:test");
      expect(limiter.getRemainingTokens("api:test")).toBe(3);
    });

    it("returns 0 when all tokens consumed", async () => {
      limiter.configure("api:test", 2, 60_000);
      await limiter.consume("api:test");
      await limiter.consume("api:test");
      expect(limiter.getRemainingTokens("api:test")).toBe(0);
    });

    it("returns Infinity for unconfigured keys", () => {
      expect(limiter.getRemainingTokens("no-config")).toBe(Infinity);
    });

    it("recovers tokens after window expires", async () => {
      limiter.configure("api:test", 2, 10_000);
      await limiter.consume("api:test");
      await limiter.consume("api:test");
      expect(limiter.getRemainingTokens("api:test")).toBe(0);

      vi.advanceTimersByTime(10_001);
      expect(limiter.getRemainingTokens("api:test")).toBe(2);
    });
  });

  describe("reset and clear", () => {
    it("reset removes timestamps for a specific key", async () => {
      limiter.configure("api:test", 2, 60_000);
      await limiter.consume("api:test");
      await limiter.consume("api:test");
      expect(limiter.getRemainingTokens("api:test")).toBe(0);

      limiter.reset("api:test");
      expect(limiter.getRemainingTokens("api:test")).toBe(2);
    });

    it("reset does not affect other keys", async () => {
      limiter.configure("dv360:*", 2, 60_000);
      await limiter.consume("dv360:aaa");
      await limiter.consume("dv360:bbb");

      limiter.reset("dv360:aaa");
      expect(limiter.getRemainingTokens("dv360:aaa")).toBe(2);
      expect(limiter.getRemainingTokens("dv360:bbb")).toBe(1);
    });

    it("clear removes all request timestamps", async () => {
      limiter.configure("dv360:*", 2, 60_000);
      await limiter.consume("dv360:aaa");
      await limiter.consume("dv360:bbb");

      limiter.clear();
      expect(limiter.getRemainingTokens("dv360:aaa")).toBe(2);
      expect(limiter.getRemainingTokens("dv360:bbb")).toBe(2);
    });
  });

  describe("destroy", () => {
    it("clears all state and stops the interval", () => {
      limiter.configure("api:test", 5, 60_000);
      limiter.destroy();
      expect(limiter.getRemainingTokens("api:test")).toBe(Infinity);
    });

    it("is safe to call destroy multiple times", () => {
      limiter.destroy();
      limiter.destroy();
    });
  });

  describe("retryAfter in error data", () => {
    it("includes retryAfterMs and retryAfterSeconds in error data", async () => {
      limiter.configure("api:test", 1, 30_000);
      await limiter.consume("api:test");

      try {
        await limiter.consume("api:test");
        expect.unreachable("should have thrown");
      } catch (err) {
        const data = (err as McpError).data!;
        expect(data.retryAfterMs).toBeTypeOf("number");
        expect(data.retryAfterSeconds).toBeTypeOf("number");
        expect(data.retryAfterSeconds).toBeGreaterThan(0);
      }
    });
  });

  // The limiter used to throw the moment a window was full. With 3-token writes
  // and per-item bulk loops that left batches half-applied after 3-6 items, so
  // it now queues for capacity up to `maxWaitMs` and only then rejects.
  describe("queueing up to maxWaitMs", () => {
    it("waits for the window instead of throwing when the wait is within maxWaitMs", async () => {
      limiter.configure("api:test", 2, 10_000, { maxWaitMs: 10_000 });
      await limiter.consume("api:test");
      await limiter.consume("api:test");

      const third = track(limiter.consume("api:test"));
      await vi.advanceTimersByTimeAsync(9_999);
      expect(third.settledAt).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1);
      expect(third.error).toBeUndefined();
      expect(third.settledAt).toBe(new Date("2025-01-15T12:00:10Z").getTime());
    });

    it("admits concurrent callers FIFO at distinct instants without overshooting", async () => {
      limiter.configure("api:test", 2, 10_000, { maxWaitMs: 60_000 });
      const start = Date.now();

      const calls = Array.from({ length: 6 }, () => track(limiter.consume("api:test")));
      await vi.advanceTimersByTimeAsync(60_000);

      const admittedAt = calls.map((c) => {
        expect(c.error).toBeUndefined();
        return c.settledAt! - start;
      });
      // Two per 10s window, in call order — not all six waking at 10s together.
      expect(admittedAt).toEqual([0, 0, 10_000, 10_000, 20_000, 20_000]);

      // Sliding-window invariant over every admission instant.
      for (const t of admittedAt) {
        const inWindow = admittedAt.filter((u) => u <= t && t - u < 10_000).length;
        expect(inWindow).toBeLessThanOrEqual(2);
      }
    });

    it("rejects without reserving when admission is further away than maxWaitMs", async () => {
      limiter.configure("api:test", 1, 10_000, { maxWaitMs: 10_000 });
      await limiter.consume("api:test"); // admitted at 0
      const queued = track(limiter.consume("api:test")); // admitted at 10s

      // Behind the queued caller, admission is 20s away: over the 10s cap.
      const err = await limiter.consume("api:test").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
      expect((err as McpError).data).toMatchObject({
        reason: "wait_exceeds_max",
        retryAfterMs: 20_000,
        retryAfterSeconds: 20,
        maxWaitMs: 10_000,
      });

      // The rejected caller held no slot: once the queued one is admitted the
      // next caller needs only one more window, not two.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(queued.error).toBeUndefined();
      expect(queued.settledAt).toBeDefined();
      const next = track(limiter.consume("api:test"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(next.error).toBeUndefined();
      expect(next.settledAt).toBeDefined();
    });

    it("rejects at once a request larger than the limit, however long it could wait", async () => {
      limiter.configure("api:test", 2, 10_000, { maxWaitMs: 3_600_000 });
      const err = await limiter.consume("api:test", 3).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
      expect((err as McpError).data).toMatchObject({ reason: "tokens_exceed_limit", tokens: 3 });
      expect(vi.getTimerCount()).toBe(1); // only the cleanup interval
    });

    it("counts queued reservations as consumed in getRemainingTokens", async () => {
      limiter.configure("api:test", 2, 10_000, { maxWaitMs: 10_000 });
      await limiter.consume("api:test", 2);
      track(limiter.consume("api:test"));
      expect(limiter.getRemainingTokens("api:test")).toBe(0);
    });

    it("destroy() rejects queued callers and leaves no timers behind", async () => {
      limiter.configure("api:test", 1, 10_000, { maxWaitMs: 60_000 });
      await limiter.consume("api:test");
      const a = limiter.consume("api:test");
      const b = limiter.consume("api:test");
      const aErr = a.catch((e: unknown) => e);
      const bErr = b.catch((e: unknown) => e);

      limiter.destroy();

      for (const err of [await aErr, await bErr]) {
        expect(err).toBeInstanceOf(McpError);
        expect((err as McpError).code).toBe(JsonRpcErrorCode.ServiceUnavailable);
      }
      expect(vi.getTimerCount()).toBe(0);
    });

    it("labels the hit metric with the matched pattern, not the per-account key", async () => {
      vi.mocked(recordRateLimitHit).mockClear();
      limiter.configure("dv360:*", 1, 10_000);
      await limiter.consume("dv360:advertiser-123");
      await expect(limiter.consume("dv360:advertiser-123")).rejects.toThrow(McpError);
      expect(recordRateLimitHit).toHaveBeenCalledWith("dv360:*");
    });

    it("rejects a negative or non-finite maxWaitMs", () => {
      expect(() => limiter.configure("api:test", 1, 1_000, { maxWaitMs: -1 })).toThrow(RangeError);
      expect(() => limiter.configure("api:test", 1, 1_000, { maxWaitMs: Infinity })).toThrow(
        RangeError
      );
    });
  });

  describe("maxWaitMs defaults", () => {
    it("a bare RateLimiter does not queue unless told to", async () => {
      limiter.configure("api:test", 1, 10_000);
      expect(limiter.describeLimits()).toEqual([
        { pattern: "api:test", limit: 1, windowMs: 10_000, maxWaitMs: 0 },
      ]);

      const withDefault = new RateLimiter({ defaultMaxWaitMs: 5_000 });
      withDefault.configure("api:test", 1, 10_000);
      withDefault.configure("api:other", 1, 10_000, { maxWaitMs: 0 });
      expect(withDefault.describeLimits().map((d) => d.maxWaitMs)).toEqual([5_000, 0]);
      withDefault.destroy();
    });

    it("createPlatformRateLimiter queues for two windows and publishes it", async () => {
      const platform = createPlatformRateLimiter("tiktok", 10);
      try {
        expect(platform.describeLimits()).toEqual([
          {
            pattern: "tiktok:*",
            limit: 10,
            windowMs: PLATFORM_RATE_LIMIT_WINDOW_MS,
            maxWaitMs: PLATFORM_RATE_LIMIT_MAX_WAIT_MS,
          },
        ]);

        // The reviewed failure: 10/min with 3-token writes threw on the 4th
        // write. It must now wait for the window instead.
        for (let i = 0; i < 3; i++) await platform.consume("tiktok:default", 3);
        const fourth = track(platform.consume("tiktok:default", 3));
        await vi.advanceTimersByTimeAsync(59_999);
        expect(fourth.settledAt).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(fourth.error).toBeUndefined();
        expect(fourth.settledAt).toBeDefined();
      } finally {
        platform.destroy();
      }
    });

    it("lets a 50-item bulk of 3-token writes at 10/min complete instead of failing mid-batch", async () => {
      // The reviewed failure end to end: the real executor (5 in flight) over
      // the real platform limiter. With fail-fast only 3 items succeeded; with
      // a one-window budget 17 of 50 still failed, because 4 in-flight items
      // x 3 tokens queue more than a 10/min window ahead of the next one.
      const platform = createPlatformRateLimiter("tiktok", 10);
      try {
        const items = Array.from({ length: 50 }, (_, i) => i);
        const pending = executeBulkConcurrent(items, async (i) => {
          await platform.consume("tiktok:default", 3);
          return i;
        });
        await vi.advanceTimersByTimeAsync(20 * PLATFORM_RATE_LIMIT_WINDOW_MS);
        const results = await pending;
        expect(results.filter((r) => !r.success)).toEqual([]);
      } finally {
        platform.destroy();
      }
    });

    it("createPlatformRateLimiter accepts a per-limiter maxWaitMs", () => {
      const platform = createPlatformRateLimiter("meta", 20, { maxWaitMs: 5_000 });
      expect(platform.describeLimits()[0]?.maxWaitMs).toBe(5_000);
      platform.destroy();
    });
  });
});
