// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TtdAuthAdapter } from "../../auth/ttd-auth-adapter.js";
import { executeWithRetry, fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withTtdApiSpan } from "../../utils/platform.js";

const TTD_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  timeoutMs: 30_000,
  platformName: "TTD",
};

/**
 * Shared HTTP client for TTD API requests.
 *
 * Delegates authentication to the injected TtdAuthAdapter (which handles
 * token caching, refresh, and mutex internally). Provides retry logic with
 * exponential backoff and consistent error handling.
 */
export class TtdHttpClient {
  constructor(
    private authAdapter: TtdAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  get partnerId(): string {
    return this.authAdapter.partnerId;
  }

  /**
   * Make an authenticated request to the TTD API.
   *
   * - Prepends `baseUrl` to `path`.
   * - Retries on 429 and 5xx with exponential backoff (respects Retry-After).
   * - Parses JSON or returns `{}` for 204 No Content.
   */
  async fetch(path: string, context?: RequestContext, options?: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug({ url, method, requestId: context?.requestId }, "Making TTD API request");

    return withTtdApiSpan(`api.${method}`, path, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      const result = await executeWithRetry(TTD_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            "Content-Type": "application/json",
            "TTD-Auth": accessToken,
          };
        },
      });
      return result;
    });
  }

  /**
   * Make an authenticated request to a full URL (not prepending baseUrl).
   *
   * Used for endpoints on a different host (e.g., GraphQL at desk.thetradedesk.com).
   * Same retry/auth logic as `fetch`.
   */
  async fetchDirect(
    fullUrl: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const method = options?.method || "GET";

    this.logger.debug(
      { url: fullUrl, method, requestId: context?.requestId },
      "Making TTD API request (direct URL)"
    );

    return withTtdApiSpan(`api.direct.${method}`, fullUrl, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", fullUrl);
      const result = await executeWithRetry(TTD_RETRY_CONFIG, {
        url: fullUrl,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            "Content-Type": "application/json",
            "TTD-Auth": accessToken,
          };
        },
      });
      return result;
    });
  }
}
