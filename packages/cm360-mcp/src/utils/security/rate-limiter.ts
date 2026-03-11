export { RateLimiter } from "@cesteral/shared";
import { createPlatformRateLimiter } from "@cesteral/shared";

export const rateLimiter = createPlatformRateLimiter("cm360", 50);
