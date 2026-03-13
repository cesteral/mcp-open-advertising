import type { Logger } from "pino";
import type { SnapchatAuthAdapter } from "../auth/snapchat-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { SnapchatHttpClient } from "./snapchat/snapchat-http-client.js";
import { SnapchatService } from "./snapchat/snapchat-service.js";
import { SnapchatReportingService } from "./snapchat/snapchat-reporting-service.js";

export interface SessionServices {
  snapchatService: SnapchatService;
  snapchatReportingService: SnapchatReportingService;
}

export interface SnapchatSessionConfig {
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export function createSessionServices(
  authAdapter: SnapchatAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter,
  sessionConfig: SnapchatSessionConfig
): SessionServices {
  const httpClient = new SnapchatHttpClient(
    authAdapter,
    baseUrl
  );
  const snapchatService = new SnapchatService(
    httpClient,
    authAdapter.orgId,
    authAdapter.adAccountId
  );
  const snapchatReportingService = new SnapchatReportingService(
    rateLimiter,
    httpClient,
    authAdapter.adAccountId,
    logger,
    sessionConfig.reportPollIntervalMs,
    sessionConfig.reportMaxPollAttempts
  );

  return {
    snapchatService,
    snapchatReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
