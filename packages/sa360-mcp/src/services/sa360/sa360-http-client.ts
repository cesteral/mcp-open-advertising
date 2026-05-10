// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { SA360AuthAdapter } from "../../auth/sa360-auth-adapter.js";
import { JsonRpcErrorCode, executeWithRetry, fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withSA360ApiSpan } from "../../utils/platform.js";

const SA360_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  timeoutMs: 30_000,
  platformName: "SA360",
};

/**
 * SA360 API error response structure.
 */
interface SA360Failure {
  errors?: Array<{
    errorCode?: Record<string, string>;
    message?: string;
  }>;
}

/**
 * Parse SA360 error response body into a human-readable summary.
 */
function parseSA360Errors(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { details?: SA360Failure[]; message?: string } };

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

    if (parsed.error && typeof parsed.error === "object" && "message" in parsed.error) {
      return (parsed.error as { message: string }).message;
    }

    return body.substring(0, 500);
  } catch {
    return body.substring(0, 500);
  }
}

function mapSA360StatusCode(status: number): JsonRpcErrorCode {
  if (status >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  if (status === 429) return JsonRpcErrorCode.RateLimited;
  if (status === 403) return JsonRpcErrorCode.Forbidden;
  return JsonRpcErrorCode.InvalidRequest;
}

function buildSA360NextAction(
  status: number,
  _errorBody: string,
  defaultHint: string | undefined
): string | undefined {
  if (status === 401) {
    return "Renew the SA360 OAuth access token. Refresh it via the configured refresh token, or re-run the OAuth consent flow if the refresh token was revoked.";
  }
  if (status === 403) {
    return "Verify the authenticated user has access to this SA360 customer/agency. The login-customer-id header must reflect the SA360 manager account hierarchy.";
  }
  if (status === 404) {
    return "Verify the customerId / agencyId / advertiserId with sa360_list_accounts before retrying.";
  }
  return defaultHint;
}

/**
 * HTTP client for SA360 Reporting API v0.
 *
 * Delegates authentication to the injected SA360AuthAdapter.
 * Provides retry logic with exponential backoff and consistent error handling.
 * Includes optional login-customer-id header for manager account access.
 */
export class SA360HttpClient {
  constructor(
    private authAdapter: SA360AuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  get loginCustomerId(): string | undefined {
    return this.authAdapter.loginCustomerId;
  }

  /**
   * Make an authenticated request to the SA360 Reporting API v0.
   */
  async fetch(path: string, context?: RequestContext, options?: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method || "GET";

    this.logger.debug({ url, method, requestId: context?.requestId }, "Making SA360 API request");

    return withSA360ApiSpan(`api.${method}`, path, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      const result = await executeWithRetry(SA360_RETRY_CONFIG, {
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
          };
          if (this.authAdapter.loginCustomerId) {
            headers["login-customer-id"] = this.authAdapter.loginCustomerId;
          }
          return headers;
        },
        mapStatusCode: (status) => mapSA360StatusCode(status),
        parseErrorBody: parseSA360Errors,
        buildNextAction: buildSA360NextAction,
      });
      return result;
    });
  }
}
