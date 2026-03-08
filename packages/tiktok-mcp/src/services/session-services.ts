import type { Logger } from "pino";
import type { TikTokAuthAdapter } from "../auth/tiktok-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { TikTokHttpClient } from "./tiktok/tiktok-http-client.js";
import { TikTokService } from "./tiktok/tiktok-service.js";
import { TikTokReportingService } from "./tiktok/tiktok-reporting-service.js";
import { appConfig } from "../config/index.js";

export interface SessionServices {
  tiktokService: TikTokService;
  tiktokReportingService: TikTokReportingService;
}

export function createSessionServices(
  authAdapter: TikTokAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new TikTokHttpClient(
    authAdapter,
    authAdapter.advertiserId,
    baseUrl,
    logger
  );
  const tiktokService = new TikTokService(rateLimiter, httpClient, logger);
  const tiktokReportingService = new TikTokReportingService(
    rateLimiter,
    httpClient,
    logger,
    appConfig.tiktokReportPollIntervalMs,
    appConfig.tiktokReportMaxPollAttempts
  );

  return {
    tiktokService,
    tiktokReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
