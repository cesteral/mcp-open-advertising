/**
 * Rate limiter — re-exports from @cesteral/shared
 * Server-specific default configuration applied below.
 */
export { RateLimiter } from "@cesteral/shared";
import { RateLimiter } from "@cesteral/shared";

/**
 * Global rate limiter instance for Bid Manager API
 * Configured with default limits: 100 requests per minute per advertiser
 */
export const rateLimiter = new RateLimiter();
rateLimiter.configure("bidmanager:*", 100, 60000);
