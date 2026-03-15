// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SA360AuthAdapter } from "../../auth/sa360-auth-adapter.js";
import { JsonRpcErrorCode, executeWithRetry, fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withSA360ApiSpan } from "../../utils/telemetry/tracing.js";

const SA360_V2_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  timeoutMs: 30_000,
  platformName: "SA360 v2",
};

function parseSA360V2Errors(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; errors?: Array<{ message?: string }> } };
    if (parsed.error?.message) {
      return parsed.error.message;
    }
    if (parsed.error?.errors?.length) {
      return parsed.error.errors.map((e) => e.message || "Unknown error").join("; ");
    }
    return body.substring(0, 500);
  } catch {
    return body.substring(0, 500);
  }
}

function mapSA360V2StatusCode(status: number): JsonRpcErrorCode {
  if (status >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  if (status === 429) return JsonRpcErrorCode.RateLimited;
  if (status === 403) return JsonRpcErrorCode.Forbidden;
  return JsonRpcErrorCode.InvalidRequest;
}

/**
 * HTTP client for SA360 legacy v2 API (DoubleClick Search).
 * Used exclusively for conversion insert/update operations.
 */
export class SA360V2HttpClient {
  constructor(
    private authAdapter: SA360AuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  /**
   * Make an authenticated request to the SA360 v2 API.
   */
  async fetch(
    path: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug(
      { url, method, requestId: context?.requestId },
      "Making SA360 v2 API request"
    );

    return withSA360ApiSpan(`v2.${method}`, path, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      const result = await executeWithRetry(SA360_V2_RETRY_CONFIG, {
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
        mapStatusCode: (status) => mapSA360V2StatusCode(status),
        parseErrorBody: parseSA360V2Errors,
      });
      return result;
    });
  }
}