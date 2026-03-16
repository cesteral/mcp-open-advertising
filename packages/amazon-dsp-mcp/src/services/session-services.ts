// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
  baseUrl: string;
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export function createSessionServices(
  authAdapter: AmazonDspAuthAdapter,
  config: AmazonDspSessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new AmazonDspHttpClient(
    authAdapter,
    authAdapter.profileId,
    config.baseUrl,
    logger
  );
  const amazonDspService = new AmazonDspService(rateLimiter, httpClient);
  const amazonDspReportingService = new AmazonDspReportingService(
    rateLimiter,
    httpClient,
    logger,
    config.reportPollIntervalMs,
    config.reportMaxPollAttempts
  );

  return {
    amazonDspService,
    amazonDspReportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();