// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { {{Pascal}}AuthAdapter } from "../../auth/{{key}}-auth-adapter.js";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { with{{Pascal}}ApiSpan } from "../../utils/platform.js";

/** Published on the server card (`retryDescriptor`), so keep it the policy callers meet. */
export const {{ENV}}_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "{{displayName}}",
  tokenExpiryHint: "{{displayName}} token expired. Issue a new access token.",
};

/** Query parameters for a GET. */
export type {{Pascal}}QueryParams = Record<string, string>;

/**
 * HTTP client for the {{displayName}} API: Bearer auth, the shared retry
 * policy (429 for every method, 5xx only for idempotent ones) and an OTEL span
 * per request.
 *
 * TODO(scaffold): adjust headers, error parsing and pagination to the
 * platform's API, and cite the vendor source in a `// basis:` comment.
 */
export class {{Pascal}}HttpClient {
  constructor(
    private readonly authAdapter: {{Pascal}}AuthAdapter,
    private readonly baseUrl: string,
    private readonly logger: Logger
  ) {}

  async get(path: string, params?: {{Pascal}}QueryParams, context?: RequestContext): Promise<unknown> {
    return this.executeRequest(this.buildUrl(path, params), context, { method: "GET" });
  }

  async post(path: string, data?: unknown, context?: RequestContext): Promise<unknown> {
    return this.executeRequest(this.buildUrl(path), context, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  }

  private buildUrl(path: string, params?: {{Pascal}}QueryParams): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    return url.toString();
  }

  private async executeRequest(
    url: string,
    context: RequestContext | undefined,
    options: RequestInit
  ): Promise<unknown> {
    const method = options.method || "GET";
    return with{{Pascal}}ApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry({{ENV}}_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const headers: Record<string, string> = {
            Authorization: `Bearer ${await this.authAdapter.getAccessToken()}`,
          };
          if (options.body) headers["Content-Type"] = "application/json";
          return headers;
        },
      });
    });
  }
}
