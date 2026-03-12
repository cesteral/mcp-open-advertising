import type { Logger } from "pino";
import type { PinterestAuthAdapter } from "../auth/pinterest-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { PinterestHttpClient } from "./pinterest/pinterest-http-client.js";
import { PinterestService } from "./pinterest/pinterest-service.js";
import { PinterestReportingService } from "./pinterest/pinterest-reporting-service.js";

export interface SessionServices {
  pinterestService: PinterestService;
  pinterestReportingService: PinterestReportingService;
}

export interface PinterestSessionConfig {
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export function createSessionServices(
  authAdapter: PinterestAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter,
  sessionConfig: PinterestSessionConfig
): SessionServices {
  const httpClient = new PinterestHttpClient(
    authAdapter,
    authAdapter.adAccountId,
    baseUrl,
    logger
  );
  const pinterestService = new PinterestService(rateLimiter, httpClient, logger);
  const pinterestReportingService = new PinterestReportingService(
    rateLimiter,
    httpClient,
    logger,
    sessionConfig.reportPollIntervalMs,
    sessionConfig.reportMaxPollAttempts
  );

  return {
    pinterestService,
    pinterestReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
