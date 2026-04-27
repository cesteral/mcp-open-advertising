// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { GAdsAuthAdapter } from "../../auth/gads-auth-adapter.js";
import { JsonRpcErrorCode, executeWithRetry, fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withGAdsApiSpan } from "../../utils/telemetry/tracing.js";

const GADS_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  timeoutMs: 30_000,
  platformName: "Google Ads",
};

/**
 * Google Ads API error response structure.
 * The API returns structured error objects with detailed error codes.
 */
interface GoogleAdsFailure {
  errors?: Array<{
    errorCode?: Record<string, string>;
    message?: string;
    trigger?: { stringValue?: string };
    location?: {
      fieldPathElements?: Array<{ fieldName?: string; index?: number }>;
    };
  }>;
}

/**
 * Parse Google Ads error response body into a human-readable summary.
 */
function parseGAdsErrors(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { details?: GoogleAdsFailure[] };
      message?: string;
    };

    // Standard Google API error format
    if (parsed.error?.details) {
      const failures = parsed.error.details;
      const messages: string[] = [];
      for (const failure of failures) {
        if (failure.errors) {
          for (const err of failure.errors) {
            const code = err.errorCode
              ? Object.entries(err.errorCode)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")
              : "unknown";
            messages.push(`[${code}] ${err.message || "No message"}`);
          }
        }
      }
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }

    // Fallback to top-level message
    if (parsed.error && typeof parsed.error === "object" && "message" in parsed.error) {
      return (parsed.error as { message: string }).message;
    }

    return body.substring(0, 500);
  } catch {
    return body.substring(0, 500);
  }
}

function mapGAdsStatusCode(status: number): JsonRpcErrorCode {
  if (status >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  if (status === 429) return JsonRpcErrorCode.RateLimited;
  if (status === 403) return JsonRpcErrorCode.Forbidden;
  return JsonRpcErrorCode.InvalidRequest;
}

/**
 * Shared HTTP client for Google Ads API requests.
 *
 * Delegates authentication to the injected GAdsAuthAdapter (which handles
 * token caching, refresh, and mutex internally). Provides retry logic with
 * exponential backoff and consistent error handling.
 *
 * Automatically includes the required `developer-token` and optional
 * `login-customer-id` headers on every request.
 */
export class GAdsHttpClient {
  constructor(
    private authAdapter: GAdsAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  get developerToken(): string {
    return this.authAdapter.developerToken;
  }

  get loginCustomerId(): string | undefined {
    return this.authAdapter.loginCustomerId;
  }

  /**
   * Make an authenticated request to the Google Ads API.
   *
   * - Prepends `baseUrl` to `path`.
   * - Includes `developer-token` and optional `login-customer-id` headers.
   * - Retries on 429 and 5xx with exponential backoff (respects Retry-After).
   * - Parses JSON or returns `{}` for 204 No Content.
   */
  async fetch(path: string, context?: RequestContext, options?: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug(
      { url, method, requestId: context?.requestId },
      "Making Google Ads API request"
    );

    return withGAdsApiSpan(`api.${method}`, path, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      const result = await executeWithRetry(GADS_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "developer-token": this.authAdapter.developerToken,
          };
          if (this.authAdapter.loginCustomerId) {
            headers["login-customer-id"] = this.authAdapter.loginCustomerId;
          }
          return headers;
        },
        mapStatusCode: (status) => mapGAdsStatusCode(status),
        parseErrorBody: parseGAdsErrors,
      });
      return result;
    });
  }
}
