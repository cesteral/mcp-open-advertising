// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { fetchWithTimeout, executeWithRetry, type RetryConfig } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import { withCM360ApiSpan } from "../../utils/platform.js";

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

  async fetch(path: string, context?: RequestContext, options?: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug({ url, method, requestId: context?.requestId }, "Making CM360 API request");

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
    const maxRetries = 3;

    return withCM360ApiSpan(`api.raw.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);

      let lastResponse: Response | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const accessToken = await this.authAdapter.getAccessToken();
        const response = await fetchWithTimeout(url, timeoutMs, context, {
          ...options,
          headers: {
            ...options?.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.ok || (response.status < 500 && response.status !== 429)) {
          span.setAttribute("http.response.status_code", response.status);
          return response;
        }

        lastResponse = response;
        if (attempt < maxRetries) {
          const delayMs = Math.min(1_000 * Math.pow(2, attempt), 10_000);
          this.logger.warn(
            {
              url,
              method,
              status: response.status,
              attempt: attempt + 1,
              maxRetries,
              requestId: context?.requestId,
            },
            "Retrying CM360 raw fetch after transient error"
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      span.setAttribute("http.response.status_code", lastResponse!.status);
      return lastResponse!;
    });
  }
}
