import type { Logger } from "pino";
import type { GAdsAuthAdapter } from "../auth/gads-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { GAdsHttpClient } from "./gads/gads-http-client.js";
import { GAdsService } from "./gads/gads-service.js";

export interface SessionServices {
  httpClient: GAdsHttpClient;
  gadsService: GAdsService;
}

export function createSessionServices(
  authAdapter: GAdsAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new GAdsHttpClient(authAdapter, baseUrl, logger);
  const gadsService = new GAdsService(logger, rateLimiter, httpClient);
  return { httpClient, gadsService };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
