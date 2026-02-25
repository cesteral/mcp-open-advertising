export { RateLimiter } from "@cesteral/shared";
import { createPlatformRateLimiter } from "@cesteral/shared";

export const rateLimiter = createPlatformRateLimiter("bidmanager", 100);
