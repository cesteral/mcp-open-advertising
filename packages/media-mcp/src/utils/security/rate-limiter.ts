export { RateLimiter } from "@cesteral/shared";
import { createPlatformRateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../config/index.js";

export const rateLimiter = createPlatformRateLimiter("media", mcpConfig.mediaRateLimitPerMinute);
