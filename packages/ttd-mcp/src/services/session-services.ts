import type { Logger } from "pino";
import type { TtdAuthAdapter } from "../auth/ttd-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { TtdHttpClient } from "./ttd/ttd-http-client.js";
import { TtdService } from "./ttd/ttd-service.js";
import { TtdReportingService } from "./ttd/ttd-reporting-service.js";

export interface SessionServices {
  ttdService: TtdService;
  ttdReportingService: TtdReportingService;
}

export interface TtdSessionConfig {
  baseUrl: string;
  graphqlUrl?: string;
  reportPollIntervalMs?: number;
  reportMaxPollAttempts?: number;
}

export function createSessionServices(
  authAdapter: TtdAuthAdapter,
  config: TtdSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new TtdHttpClient(authAdapter, config.baseUrl, logger);
  const ttdService = new TtdService(logger, rateLimiter, httpClient, config.graphqlUrl);
  const ttdReportingService = new TtdReportingService(rateLimiter, httpClient, logger, config.reportPollIntervalMs, config.reportMaxPollAttempts);
  return {
    ttdService,
    ttdReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
