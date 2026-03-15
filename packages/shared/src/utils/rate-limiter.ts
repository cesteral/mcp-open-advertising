/**
 * Rate Limiter — shared across all Cesteral MCP servers
 *
 * In-memory sliding window rate limiter with wildcard pattern support.
 * Each server configures its own limits (e.g., "dv360:*" or "bidmanager:*").
 */

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";
import { recordRateLimitHit } from "./metrics.js";

/**
 * Sliding window rate limiter with automatic cleanup.
 */
export class RateLimiter {
  private readonly requests: Map<string, number[]> = new Map();
  private readonly limits: Map<string, { limit: number; windowMs: number }> = new Map();
  private readonly compiledPatterns: Map<string, RegExp> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
    this.cleanupInterval.unref();
  }

  /**
   * Configure rate limit for a key pattern
   * @param keyPattern Pattern to match (e.g., "dv360:*" for all DV360 requests)
   * @param limit Number of requests allowed
   * @param windowMs Time window in milliseconds
   */
  configure(keyPattern: string, limit: number, windowMs: number): void {
    this.limits.set(keyPattern, { limit, windowMs });

    if (keyPattern.includes("*") && keyPattern !== "*") {
      const regexSource = keyPattern
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      this.compiledPatterns.set(keyPattern, new RegExp(`^${regexSource}$`));
    }
  }

  /**
   * Consume tokens from the rate limit bucket
   * @param key Unique identifier for the resource (e.g., "dv360:advertiserId")
   * @param tokens Number of tokens to consume (default: 1)
   * @throws McpError if rate limit exceeded
   */
  async consume(key: string, tokens: number = 1): Promise<void> {
    const now = Date.now();

    const limitConfig = this.findLimitConfig(key);
    if (!limitConfig) {
      return;
    }

    const { limit, windowMs } = limitConfig;

    let timestamps = this.requests.get(key) || [];
    timestamps = timestamps.filter((ts) => now - ts < windowMs);

    if (timestamps.length + tokens > limit) {
      const oldestTimestamp = timestamps[0] || now;
      const retryAfterMs = windowMs - (now - oldestTimestamp);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      recordRateLimitHit(key);

      throw new McpError(
        JsonRpcErrorCode.RateLimited,
        `Rate limit exceeded for ${key}. Retry after ${retryAfterSeconds} seconds.`,
        {
          key,
          limit,
          windowMs,
          retryAfterMs,
          retryAfterSeconds,
        }
      );
    }

    for (let i = 0; i < tokens; i++) {
      timestamps.push(now);
    }

    this.requests.set(key, timestamps);
  }

  /**
   * Get remaining tokens for a key
   */
  getRemainingTokens(key: string): number {
    const now = Date.now();
    const limitConfig = this.findLimitConfig(key);

    if (!limitConfig) {
      return Infinity;
    }

    const { limit, windowMs } = limitConfig;
    const timestamps = this.requests.get(key) || [];
    const activeTimestamps = timestamps.filter((ts) => now - ts < windowMs);

    return Math.max(0, limit - activeTimestamps.length);
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.requests.clear();
  }

  private findLimitConfig(
    key: string
  ): { limit: number; windowMs: number } | undefined {
    if (this.limits.has(key)) {
      return this.limits.get(key);
    }

    for (const [pattern, config] of this.limits.entries()) {
      if (this.matchPattern(key, pattern)) {
        return config;
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
    const maxAge = 3600000;

    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter((ts) => now - ts < maxAge);

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
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.requests.clear();
    this.limits.clear();
    this.compiledPatterns.clear();
  }
}

/**
 * Create a pre-configured rate limiter for a named platform.
 *
 * @param platformName Short platform identifier (e.g., "bidmanager", "dv360")
 * @param requestsPerMinute Sliding-window request cap
 * @returns Configured RateLimiter instance ready for use
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
  requestsPerMinute: number
): RateLimiter {
  const limiter = new RateLimiter();
  limiter.configure(`${platformName}:*`, requestsPerMinute, 60_000);
  return limiter;
}
