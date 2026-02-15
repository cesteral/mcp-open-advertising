import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
import { RateLimiter } from "../utils/security/rate-limiter.js";
import { DV360HttpClient } from "./dv360/dv360-http-client.js";
import { DV360Service } from "./dv360/DV360-service.js";
import { TargetingService } from "./targeting/targeting-service.js";

export interface SessionServices {
  httpClient: DV360HttpClient;
  dv360Service: DV360Service;
  targetingService: TargetingService;
}

export function createSessionServices(
  authAdapter: GoogleAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new DV360HttpClient(authAdapter, baseUrl, logger);
  const dv360Service = new DV360Service(logger, rateLimiter, httpClient);
  const targetingService = new TargetingService(logger, rateLimiter, httpClient);
  return { httpClient, dv360Service, targetingService };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
