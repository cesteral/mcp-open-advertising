// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withDV360ApiSpan } from "../../utils/platform.js";

const DV360_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  timeoutMs: 10_000,
  platformName: "DV360",
};

/**
 * Shared HTTP client for DV360 API requests.
 *
 * Delegates authentication to the injected GoogleAuthAdapter (which handles
 * token caching, refresh, and mutex internally). Provides retry logic with
 * exponential backoff and consistent error handling via shared executeWithRetry.
 */
export class DV360HttpClient {
  constructor(
    private authAdapter: GoogleAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  /**
   * Derive the upload base URL from the configured base URL.
   *
   * For a base URL like `https://displayvideo.googleapis.com/v4`
   * the upload base is `https://displayvideo.googleapis.com/upload/displayvideo/v4`.
   */
  getUploadBaseUrl(): string {
    const parsed = new URL(this.baseUrl);
    // pathname is e.g. "/v4"
    return `${parsed.origin}/upload/displayvideo${parsed.pathname}`;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Make an authenticated request to the DV360 API.
   *
   * - Prepends `baseUrl` to `path`.
   * - Retries on 429 and 5xx with exponential backoff (respects Retry-After).
   * - Parses JSON or returns `{}` for 204 No Content.
   */
  async fetch(path: string, context?: RequestContext, options?: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug({ url, method, requestId: context?.requestId }, "Making DV360 API request");

    return withDV360ApiSpan(`api.${method}`, path, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(DV360_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          };
        },
      });
    });
  }

  /**
   * Make an authenticated request with full caller control over the URL,
   * timeout, and options.
   *
   * Used by upload endpoints (e.g. custom bidding script/rules uploads)
   * that require absolute URLs and non-JSON content types.
   *
   * **No retry logic** is applied - the caller is responsible for error handling.
   */
  async fetchRaw(
    url: string,
    timeoutMs: number,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<Response> {
    const method = options?.method || "POST";

    return withDV360ApiSpan(`api.raw.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      const accessToken = await this.authAdapter.getAccessToken();
      const response = await fetchWithTimeout(url, timeoutMs, context, {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      span.setAttribute("http.response.status_code", response.status);
      return response;
    });
  }
}
