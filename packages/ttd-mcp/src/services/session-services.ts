import type { Logger } from "pino";
import type { TtdAuthAdapter } from "../auth/ttd-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { TtdHttpClient } from "./ttd/ttd-http-client.js";
import { TtdService } from "./ttd/ttd-service.js";
import { TtdReportingService } from "./ttd/ttd-reporting-service.js";

export interface SessionServices {
  httpClient: TtdHttpClient;
  ttdService: TtdService;
  ttdReportingService: TtdReportingService;
}

export function createSessionServices(
  authAdapter: TtdAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new TtdHttpClient(authAdapter, baseUrl, logger);
  const ttdService = new TtdService(logger, rateLimiter, httpClient);
  const ttdReportingService = new TtdReportingService(logger, rateLimiter, httpClient);
  return { httpClient, ttdService, ttdReportingService };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
