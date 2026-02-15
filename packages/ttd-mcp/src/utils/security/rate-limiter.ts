/**
 * Rate limiter — re-exports from @cesteral/shared
 * Server-specific default configuration applied below.
 */
export { RateLimiter } from "@cesteral/shared";
import { RateLimiter } from "@cesteral/shared";

/**
 * Global rate limiter instance for TTD API
 * Configured with default limits: 100 requests per minute per advertiser
 */
export const rateLimiter = new RateLimiter();
rateLimiter.configure("ttd:*", 100, 60000);
