// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SA360AuthAdapter } from "../auth/sa360-auth-adapter.js";
import type { RateLimiter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { SA360HttpClient } from "./sa360/sa360-http-client.js";
import { SA360V2HttpClient } from "./sa360-v2/sa360-v2-http-client.js";
import { SA360Service } from "./sa360/sa360-service.js";
import { ConversionService } from "./sa360-v2/conversion-service.js";
import { SA360ReportingService } from "./sa360-v2/reporting-service.js";

export interface SessionServices {
  httpClient: SA360HttpClient;
  v2HttpClient: SA360V2HttpClient;
  sa360Service: SA360Service;
  conversionService: ConversionService;
  reportingService: SA360ReportingService;
}

export interface SA360SessionConfig {
  baseUrl: string;
  v2BaseUrl: string;
}

export function createSessionServices(
  authAdapter: SA360AuthAdapter,
  config: SA360SessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new SA360HttpClient(authAdapter, config.baseUrl, logger);
  const v2HttpClient = new SA360V2HttpClient(authAdapter, config.v2BaseUrl, logger);
  const sa360Service = new SA360Service(logger, rateLimiter, httpClient);
  const conversionService = new ConversionService(logger, rateLimiter, v2HttpClient);
  const reportingService = new SA360ReportingService(
    logger,
    rateLimiter,
    v2HttpClient,
    authAdapter
  );
  return {
    httpClient,
    v2HttpClient,
    sa360Service,
    conversionService,
    reportingService,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
