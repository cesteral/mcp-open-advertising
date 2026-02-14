import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../src/utils/rate-limiter.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/mcp-errors.js";

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
});
