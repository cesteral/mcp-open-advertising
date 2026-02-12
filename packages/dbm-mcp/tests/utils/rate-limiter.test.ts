import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../src/utils/security/rate-limiter.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/errors/index.js";

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

  // ==========================================================================
  // Basic rate limiting
  // ==========================================================================

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
      // No configure call — should just pass through
      await expect(limiter.consume("unknown:key")).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // Sliding window
  // ==========================================================================

  describe("sliding window", () => {
    it("allows new requests after old ones expire from the window", async () => {
      limiter.configure("api:test", 2, 10_000); // 2 per 10s

      await limiter.consume("api:test");
      await limiter.consume("api:test");

      // All tokens used
      await expect(limiter.consume("api:test")).rejects.toThrow(McpError);

      // Advance time past the window
      vi.advanceTimersByTime(10_001);

      // Old timestamps have expired — new requests should succeed
      await expect(limiter.consume("api:test")).resolves.toBeUndefined();
    });

    it("partially expires old timestamps (sliding, not tumbling)", async () => {
      limiter.configure("api:test", 2, 10_000);

      // T=0: consume first token
      await limiter.consume("api:test");

      // T=5s: consume second token
      vi.advanceTimersByTime(5_000);
      await limiter.consume("api:test");

      // T=5s: limit reached
      await expect(limiter.consume("api:test")).rejects.toThrow(McpError);

      // T=10.001s: first token expired, second still active
      vi.advanceTimersByTime(5_001);
      await expect(limiter.consume("api:test")).resolves.toBeUndefined();

      // Limit reached again (second original + new one)
      await expect(limiter.consume("api:test")).rejects.toThrow(McpError);
    });
  });

  // ==========================================================================
  // Pattern matching
  // ==========================================================================

  describe("pattern matching", () => {
    it("matches wildcard pattern bidmanager:* to bidmanager:123", async () => {
      limiter.configure("bidmanager:*", 2, 60_000);

      await limiter.consume("bidmanager:123");
      await limiter.consume("bidmanager:123");

      await expect(limiter.consume("bidmanager:123")).rejects.toThrow(McpError);
    });

    it("matches wildcard pattern bidmanager:* to bidmanager:abc", async () => {
      limiter.configure("bidmanager:*", 1, 60_000);

      await limiter.consume("bidmanager:abc");
      await expect(limiter.consume("bidmanager:abc")).rejects.toThrow(McpError);
    });

    it("matches the universal wildcard * to any key", async () => {
      limiter.configure("*", 1, 60_000);

      await limiter.consume("anything:here");
      await expect(limiter.consume("anything:here")).rejects.toThrow(McpError);
    });

    it("does NOT match wildcard pattern to non-matching prefix", async () => {
      limiter.configure("bidmanager:*", 1, 60_000);

      // "other:123" should not be limited by "bidmanager:*"
      await expect(limiter.consume("other:123")).resolves.toBeUndefined();
      await expect(limiter.consume("other:123")).resolves.toBeUndefined(); // unlimited
    });
  });

  // ==========================================================================
  // Exact match
  // ==========================================================================

  describe("exact match", () => {
    it("exact key matches only the exact key", async () => {
      limiter.configure("exact-key", 1, 60_000);

      await limiter.consume("exact-key");
      await expect(limiter.consume("exact-key")).rejects.toThrow(McpError);
    });

    it("exact key does NOT match a different key", async () => {
      limiter.configure("exact-key", 1, 60_000);

      // "exact-key-other" should not match
      await expect(limiter.consume("exact-key-other")).resolves.toBeUndefined();
      await expect(limiter.consume("exact-key-other")).resolves.toBeUndefined();
    });

    it("prefers exact match over pattern match", async () => {
      limiter.configure("bidmanager:*", 10, 60_000);
      limiter.configure("bidmanager:special", 1, 60_000);

      // "bidmanager:special" should use the exact match (limit 1)
      await limiter.consume("bidmanager:special");
      await expect(limiter.consume("bidmanager:special")).rejects.toThrow(McpError);
    });
  });

  // ==========================================================================
  // Cached regex compilation
  // ==========================================================================

  describe("cached regex compilation", () => {
    it("matchPattern works correctly after configure()", async () => {
      limiter.configure("prefix:*:suffix", 1, 60_000);

      await limiter.consume("prefix:middle:suffix");
      await expect(limiter.consume("prefix:middle:suffix")).rejects.toThrow(McpError);
    });

    it("compiles regex for patterns with wildcards but not for plain strings", async () => {
      limiter.configure("plain-key", 1, 60_000);
      limiter.configure("wild:*", 1, 60_000);

      await limiter.consume("plain-key");
      await expect(limiter.consume("plain-key")).rejects.toThrow(McpError);

      await limiter.consume("wild:anything");
      await expect(limiter.consume("wild:anything")).rejects.toThrow(McpError);
    });
  });

  // ==========================================================================
  // getRemainingTokens
  // ==========================================================================

  describe("getRemainingTokens", () => {
    it("returns the full limit when no tokens have been consumed", () => {
      limiter.configure("api:test", 5, 60_000);

      expect(limiter.getRemainingTokens("api:test")).toBe(5);
    });

    it("returns correct remaining count after consumption", async () => {
      limiter.configure("api:test", 5, 60_000);

      await limiter.consume("api:test");
      await limiter.consume("api:test");

      expect(limiter.getRemainingTokens("api:test")).toBe(3);
    });

    it("returns 0 when all tokens are consumed", async () => {
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

  // ==========================================================================
  // reset / clear
  // ==========================================================================

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
      limiter.configure("bidmanager:*", 2, 60_000);

      await limiter.consume("bidmanager:aaa");
      await limiter.consume("bidmanager:bbb");

      limiter.reset("bidmanager:aaa");

      expect(limiter.getRemainingTokens("bidmanager:aaa")).toBe(2);
      expect(limiter.getRemainingTokens("bidmanager:bbb")).toBe(1);
    });

    it("clear removes all request timestamps", async () => {
      limiter.configure("bidmanager:*", 2, 60_000);

      await limiter.consume("bidmanager:aaa");
      await limiter.consume("bidmanager:bbb");

      limiter.clear();

      // Timestamps are cleared — remaining tokens should be full
      expect(limiter.getRemainingTokens("bidmanager:aaa")).toBe(2);
      expect(limiter.getRemainingTokens("bidmanager:bbb")).toBe(2);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe("cleanup", () => {
    it("removes old timestamps (older than 1 hour) on interval", async () => {
      limiter.configure("api:test", 100, 60_000);

      // Consume some tokens
      await limiter.consume("api:test");
      await limiter.consume("api:test");

      expect(limiter.getRemainingTokens("api:test")).toBe(98);

      // Advance past the cleanup max age (1 hour) + trigger cleanup interval (5 min)
      vi.advanceTimersByTime(3_600_001);

      // The window is 60s, so these are already expired from the sliding window perspective,
      // but cleanup also removes them from memory.
      expect(limiter.getRemainingTokens("api:test")).toBe(100);
    });
  });

  // ==========================================================================
  // destroy
  // ==========================================================================

  describe("destroy", () => {
    it("clears all state and stops the interval", () => {
      limiter.configure("api:test", 5, 60_000);

      limiter.destroy();

      // After destroy, getRemainingTokens should return Infinity
      // because limits are cleared
      expect(limiter.getRemainingTokens("api:test")).toBe(Infinity);
    });

    it("is safe to call destroy multiple times", () => {
      limiter.destroy();
      limiter.destroy();
      // No error thrown
    });
  });
});
