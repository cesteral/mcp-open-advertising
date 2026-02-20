import type { Logger } from "pino";
import type { TtdAuthAdapter } from "../auth/ttd-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore, createFindingBuffer, type FindingBuffer } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { TtdHttpClient } from "./ttd/ttd-http-client.js";
import { TtdService } from "./ttd/ttd-service.js";
import { TtdReportingService } from "./ttd/ttd-reporting-service.js";

export interface SessionServices {
  httpClient: TtdHttpClient;
  ttdService: TtdService;
  ttdReportingService: TtdReportingService;
  findingBuffer: FindingBuffer;
}

export function createSessionServices(
  authAdapter: TtdAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter,
  graphqlUrl?: string
): SessionServices {
  const httpClient = new TtdHttpClient(authAdapter, baseUrl, logger);
  const ttdService = new TtdService(logger, rateLimiter, httpClient, graphqlUrl);
  const ttdReportingService = new TtdReportingService(logger, rateLimiter, httpClient);
  return {
    httpClient,
    ttdService,
    ttdReportingService,
    findingBuffer: createFindingBuffer(),
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
