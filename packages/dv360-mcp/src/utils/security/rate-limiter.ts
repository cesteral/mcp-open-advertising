/**
 * Rate limiter — re-exports from @bidshifter/shared
 * Server-specific default configuration applied below.
 */
export { RateLimiter } from "@bidshifter/shared";
import { RateLimiter } from "@bidshifter/shared";

/**
 * Global rate limiter instance for DV360 API
 * Configured with default limits: 60 requests per minute per advertiser
 */
export const rateLimiter = new RateLimiter();
rateLimiter.configure("dv360:*", 60, 60000);
