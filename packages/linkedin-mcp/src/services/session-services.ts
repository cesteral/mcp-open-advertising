import type { Logger } from "pino";
import type { LinkedInAuthAdapter } from "../auth/linkedin-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { LinkedInHttpClient } from "./linkedin/linkedin-http-client.js";
import { LinkedInService } from "./linkedin/linkedin-service.js";
import { LinkedInReportingService } from "./linkedin/linkedin-reporting-service.js";

export interface SessionServices {
  httpClient: LinkedInHttpClient;
  linkedInService: LinkedInService;
  linkedInReportingService: LinkedInReportingService;
}

export function createSessionServices(
  authAdapter: LinkedInAuthAdapter,
  baseUrl: string,
  apiVersion: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new LinkedInHttpClient(authAdapter, baseUrl, apiVersion, logger);
  const linkedInService = new LinkedInService(rateLimiter, httpClient);
  const linkedInReportingService = new LinkedInReportingService(rateLimiter, httpClient);
  return {
    httpClient,
    linkedInService,
    linkedInReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
