// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { assertSafeDownloadUrl, executeWithRetry, type RetryConfig } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import { withCM360ApiSpan } from "../../utils/platform.js";

export const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  timeoutMs: 10_000,
  platformName: "CM360",
};

/** Hosts that may receive the bearer token on an absolute (raw) fetch. */
export const CM360_DOWNLOAD_HOST_SUFFIXES = ["googleapis.com"] as const;

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
    // fetchRaw attaches the user's Google bearer token to an absolute URL that
    // arrives from the MCP client (cm360_download_report). Only Google API
    // hosts may receive it — File.urls.apiUrl is on googleapis.com.
    assertSafeDownloadUrl(url, {
      allowedHostSuffixes: CM360_DOWNLOAD_HOST_SUFFIXES,
      toolName: "cm360_download_report",
    });

    const method = options?.method || "GET";

    // Same retry policy as `fetch` (and as the server card publishes), with
    // the download's own timeout. `rawResponse` hands back the CSV body
    // unread, while every attempt lands in the upstream trail that
    // `tool_failure` logs read. A non-2xx response throws `McpError`, as
    // `fetch` does.
    return withCM360ApiSpan(`api.raw.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(
        { ...RETRY_CONFIG, timeoutMs },
        {
          url,
          fetchOptions: options,
          context,
          logger: this.logger,
          getHeaders: async () => {
            const accessToken = await this.authAdapter.getAccessToken();
            return { Authorization: `Bearer ${accessToken}` };
          },
          rawResponse: true,
        }
      );
    });
  }
}
