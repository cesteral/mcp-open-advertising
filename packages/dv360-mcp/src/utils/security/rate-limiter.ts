import { McpError, JsonRpcErrorCode } from "../errors/index.js";

/**
 * Simple in-memory rate limiter using sliding window algorithm
 * Includes automatic cleanup of old timestamps to prevent memory leaks
 */
export class RateLimiter {
  private readonly requests: Map<string, number[]> = new Map();
  private readonly limits: Map<string, { limit: number; windowMs: number }> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Cleanup old entries every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Configure rate limit for a key pattern
   * @param keyPattern Pattern to match (e.g., "dv360:*" for all DV360 requests)
   * @param limit Number of requests allowed
   * @param windowMs Time window in milliseconds
   */
  configure(keyPattern: string, limit: number, windowMs: number): void {
    this.limits.set(keyPattern, { limit, windowMs });
  }

  /**
   * Consume tokens from the rate limit bucket
   * @param key Unique identifier for the resource (e.g., "dv360:advertiserId")
   * @param tokens Number of tokens to consume (default: 1)
   * @throws McpError if rate limit exceeded
   */
  async consume(key: string, tokens: number = 1): Promise<void> {
    const now = Date.now();

    // Find matching limit configuration
    const limitConfig = this.findLimitConfig(key);
    if (!limitConfig) {
      // No rate limit configured for this key
      return;
    }

    const { limit, windowMs } = limitConfig;

    // Get existing request timestamps
    let timestamps = this.requests.get(key) || [];

    // Remove timestamps outside the window
    timestamps = timestamps.filter((ts) => now - ts < windowMs);

    // Check if adding new tokens would exceed limit
    if (timestamps.length + tokens > limit) {
      const oldestTimestamp = timestamps[0] || now;
      const retryAfterMs = windowMs - (now - oldestTimestamp);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

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

    // Add new timestamps
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

  /**
   * Find matching limit configuration for a key
   */
  private findLimitConfig(
    key: string
  ): { limit: number; windowMs: number } | undefined {
    // Try exact match first
    if (this.limits.has(key)) {
      return this.limits.get(key);
    }

    // Try pattern matching
    for (const [pattern, config] of this.limits.entries()) {
      if (this.matchPattern(key, pattern)) {
        return config;
      }
    }

    return undefined;
  }

  /**
   * Match key against pattern (supports * wildcard)
   */
  private matchPattern(key: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (!pattern.includes("*")) {
      return key === pattern;
    }

    const regexPattern = pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");

    return new RegExp(`^${regexPattern}$`).test(key);
  }

  /**
   * Cleanup old timestamps to prevent memory leaks
   * Removes entries older than 1 hour
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [key, timestamps] of this.requests.entries()) {
      // Filter out timestamps older than max age
      const filtered = timestamps.filter((ts) => now - ts < maxAge);

      if (filtered.length === 0) {
        // Remove key entirely if no timestamps left
        this.requests.delete(key);
      } else if (filtered.length < timestamps.length) {
        // Update with filtered list
        this.requests.set(key, filtered);
      }
    }
  }

  /**
   * Destroy the rate limiter and stop cleanup interval
   * Call this when shutting down the application
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.requests.clear();
    this.limits.clear();
  }
}

/**
 * Global rate limiter instance
 * Configured with default limits for DV360 API
 */
export const rateLimiter = new RateLimiter();

// Default configuration: 60 requests per minute per advertiser
rateLimiter.configure("dv360:*", 60, 60000);
