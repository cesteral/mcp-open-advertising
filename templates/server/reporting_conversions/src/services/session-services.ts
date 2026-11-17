// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { {{Pascal}}AuthAdapter } from "../auth/{{key}}-auth-adapter.js";
import type { RateLimiter } from "@cesteral/shared";
// {{#writes}}
import { createSessionBoundReportCsvStore, SessionServiceStore } from "@cesteral/shared";
// {{/writes}}
// {{^writes}}
import { SessionServiceStore } from "@cesteral/shared";
// {{/writes}}
export { SessionServiceStore } from "@cesteral/shared";
import { {{Pascal}}HttpClient } from "./{{key}}/{{key}}-http-client.js";
import { {{Pascal}}Service } from "./{{key}}/{{key}}-service.js";
import { {{Pascal}}EntityService } from "./{{key}}/{{key}}-entity-service.js";
// {{#writes}}
import { {{Pascal}}ReportingService } from "./{{key}}/{{key}}-reporting-service.js";
// {{/writes}}

export interface SessionServices {
  /** Accounts and synchronous reports. */
  {{key}}Service: {{Pascal}}Service;
  {{key}}EntityService: {{Pascal}}EntityService;
  // {{#writes}}
  /** The async report job: status and download. */
  {{key}}ReportingService: {{Pascal}}ReportingService;
  // {{/writes}}
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
    // {{#writes}}
    {{key}}ReportingService: new {{Pascal}}ReportingService(
      rateLimiter,
      httpClient,
      logger,
      config.baseUrl
    ),
    // {{/writes}}
    boundAccountId: authAdapter.accountId,
  };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
// {{#writes}}

/**
 * Raw report CSVs stored on demand by `{{key}}_download_report`
 * (`storeRawCsv: true`) and served as `report-csv://{id}`.
 */
export const reportCsvStore = createSessionBoundReportCsvStore({
  sessionServiceStore,
  spillPlatform: "{{key}}",
});
// {{/writes}}
