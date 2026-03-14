import type { Logger } from "pino";
import type { RateLimiter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
import type { MsAdsAuthAdapter } from "../auth/msads-auth-adapter.js";
import { MsAdsHttpClient } from "./msads/msads-http-client.js";
import { MsAdsService } from "./msads/msads-service.js";
import { MsAdsReportingService } from "./msads/msads-reporting-service.js";

export interface SessionServices {
  msadsService: MsAdsService;
  msadsReportingService: MsAdsReportingService;
}

export interface MsAdsSessionConfig {
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

export function createSessionServices(
  authAdapter: MsAdsAuthAdapter,
  campaignApiBaseUrl: string,
  reportingApiBaseUrl: string,
  logger: Logger,
  _rateLimiter: RateLimiter,
  sessionConfig: MsAdsSessionConfig
): SessionServices {
  const campaignClient = new MsAdsHttpClient(authAdapter, campaignApiBaseUrl);
  const reportingClient = new MsAdsHttpClient(authAdapter, reportingApiBaseUrl);

  const msadsService = new MsAdsService(campaignClient, logger);
  const msadsReportingService = new MsAdsReportingService(
    reportingClient,
    logger,
    sessionConfig.reportPollIntervalMs,
    sessionConfig.reportMaxPollAttempts
  );

  return { msadsService, msadsReportingService };
}
