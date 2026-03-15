// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { fetchWithTimeout, executeWithRetry, type RetryConfig } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import { withCM360ApiSpan } from "../../utils/telemetry/tracing.js";

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  timeoutMs: 10_000,
  platformName: "CM360",
};

export class CM360HttpClient {
  constructor(
    private authAdapter: GoogleAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  async fetch(
    path: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug(
      { url, method, requestId: context?.requestId },
      "Making CM360 API request"
    );

    return withCM360ApiSpan(`api.${method}`, path, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return { Authorization: `Bearer ${accessToken}` };
        },
      });
    });
  }

  async fetchRaw(
    url: string,
    timeoutMs: number,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<Response> {
    const method = options?.method || "GET";

    return withCM360ApiSpan(`api.raw.${method}`, url, async (span) => {
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