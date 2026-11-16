// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { {{Pascal}}AuthAdapter } from "../auth/{{key}}-auth-adapter.js";
import type { RateLimiter } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { {{Pascal}}HttpClient } from "./{{key}}/{{key}}-http-client.js";
import { {{Pascal}}Service } from "./{{key}}/{{key}}-service.js";
import { {{Pascal}}EntityService } from "./{{key}}/{{key}}-entity-service.js";

export interface SessionServices {
  /** Accounts and reports. */
  {{key}}Service: {{Pascal}}Service;
  {{key}}EntityService: {{Pascal}}EntityService;
  /**
   * The account this session is bound to at authentication time. Tool
   * handlers call `assertAccountScope` with it, so a caller cannot name
   * another account than the one the session authenticated for.
   */
  boundAccountId: string;
}

export interface {{Pascal}}SessionConfig {
  baseUrl: string;
}

export function createSessionServices(
  authAdapter: {{Pascal}}AuthAdapter,
  config: {{Pascal}}SessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new {{Pascal}}HttpClient(authAdapter, config.baseUrl, logger);
  return {
    {{key}}Service: new {{Pascal}}Service(rateLimiter, httpClient, logger),
    {{key}}EntityService: new {{Pascal}}EntityService(rateLimiter, httpClient, logger),
    boundAccountId: authAdapter.accountId,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
