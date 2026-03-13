import type { Logger } from "pino";
import type { AmazonDspAuthAdapter } from "../auth/amazon-dsp-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { AmazonDspHttpClient } from "./amazon-dsp/amazon-dsp-http-client.js";
import { AmazonDspService } from "./amazon-dsp/amazon-dsp-service.js";
import { AmazonDspReportingService } from "./amazon-dsp/amazon-dsp-reporting-service.js";

export interface SessionServices {
  amazonDspService: AmazonDspService;
  amazonDspReportingService: AmazonDspReportingService;
}

export interface AmazonDspSessionConfig {
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export function createSessionServices(
  authAdapter: AmazonDspAuthAdapter,
  baseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter,
  sessionConfig: AmazonDspSessionConfig
): SessionServices {
  const httpClient = new AmazonDspHttpClient(
    authAdapter,
    authAdapter.profileId,
    baseUrl
  );
  const amazonDspService = new AmazonDspService(httpClient);
  const amazonDspReportingService = new AmazonDspReportingService(
    rateLimiter,
    httpClient,
    logger,
    sessionConfig.reportPollIntervalMs,
    sessionConfig.reportMaxPollAttempts
  );

  return {
    amazonDspService,
    amazonDspReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
