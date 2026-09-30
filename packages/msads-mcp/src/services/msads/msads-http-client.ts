// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MsAdsAuthAdapter } from "../../auth/msads-auth-adapter.js";
import {
  fetchWithTimeout,
  executeWithRetry,
  JsonRpcErrorCode,
  mapHttpStatusToJsonRpc,
} from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withMsAdsApiSpan } from "../../utils/platform.js";

export const MSADS_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Microsoft Ads",
  tokenExpiryHint: "Microsoft Ads token expired. Regenerate via Microsoft identity platform.",
};

/**
 * HTTP client for Microsoft Advertising API v13 JSON endpoints.
 *
 * All requests include 4 auth headers:
 * - Authorization: OAuth2 access token with Bearer prefix
 * - DeveloperToken: per-app developer token
 * - CustomerId: manager account ID
 * - CustomerAccountId: ad account ID
 *
 * Microsoft Ads JSON API patterns:
 * - Mutations and deletes post to the collection path, e.g. /Campaigns
 * - Reads post to query paths, e.g. /Campaigns/QueryByAccountId
 * - Response is plain JSON (no wrapper envelope)
 * - Errors: { TrackingId, Type, Message, ErrorCode }
 */
/**
 * Microsoft Advertising throttle codes and their DOCUMENTED waits
 * (MicrosoftDocs/Advertising guides/services-protocol.md "Handle Throttling"
 * and handle-service-errors-exceptions.md):
 *   - 117 CallRateExceeded (Campaign Management, Ad Insight): "resubmit the
 *     request under the limit after waiting 60 seconds".
 *   - 4204 BulkServiceNoMoreCallsPermittedForTheTimePeriod (Bulk): "resubmit
 *     your request after waiting up to 15 minutes".
 * Both arrive in the JSON error body (ApplicationFault OperationErrors / Errors),
 * not as an HTTP 429, so they must be read from the body.
 */
const MSADS_THROTTLE_WAITS: ReadonlyArray<{ code: number; symbol: string; waitMs: number }> = [
  { code: 117, symbol: "CallRateExceeded", waitMs: 60_000 },
  { code: 4204, symbol: "BulkServiceNoMoreCallsPermittedForTheTimePeriod", waitMs: 15 * 60_000 },
];

function collectErrorCodes(node: unknown, out: Array<string | number>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectErrorCodes(child, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (
      (key === "Code" || key === "ErrorCode") &&
      (typeof value === "number" || typeof value === "string")
    ) {
      out.push(value);
    } else if (typeof value === "object") {
      collectErrorCodes(value, out);
    }
  }
}

/** The documented wait for a Microsoft Advertising throttle error body, else undefined. */
export function msadsThrottleDelayMs(_status: number, errorBody: string): number | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(errorBody);
  } catch {
    return undefined;
  }
  const codes: Array<string | number> = [];
  collectErrorCodes(parsed, codes);
  let wait: number | undefined;
  for (const { code, symbol, waitMs } of MSADS_THROTTLE_WAITS) {
    if (codes.some((c) => c === code || c === String(code) || c === symbol)) {
      wait = Math.max(wait ?? 0, waitMs);
    }
  }
  return wait;
}

/** Throttle bodies map to RateLimited whatever their HTTP status; the rest use the fleet default. */
export function mapMsAdsStatusCode(status: number, errorBody: string): JsonRpcErrorCode {
  return msadsThrottleDelayMs(status, errorBody) !== undefined
    ? JsonRpcErrorCode.RateLimited
    : mapHttpStatusToJsonRpc(status);
}

export class MsAdsHttpClient {
  constructor(
    private readonly authAdapter: MsAdsAuthAdapter,
    private readonly baseUrl: string,
    private readonly logger: import("pino").Logger
  ) {}

  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);
    return this.executeRequest(url, "GET", context);
  }

  async post(
    path: string,
    data?: Record<string, unknown> | unknown[],
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeRequest(url, "POST", context, {
      body: JSON.stringify(data),
    });
  }

  async put(
    path: string,
    data?: Record<string, unknown> | unknown[],
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeRequest(url, "PUT", context, {
      body: JSON.stringify(data),
    });
  }

  async delete(
    path: string,
    data?: Record<string, unknown> | unknown[],
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeRequest(url, "DELETE", context, {
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }

  async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    data?: Record<string, unknown> | unknown[],
    context?: RequestContext
  ): Promise<unknown> {
    switch (method) {
      case "GET":
        return this.get(path, undefined, context);
      case "POST":
        return this.post(path, data, context);
      case "PUT":
        return this.put(path, data, context);
      case "DELETE":
        return this.delete(path, data, context);
    }
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  }

  private async executeRequest(
    url: string,
    method: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    return withMsAdsApiSpan(`api.${method}`, undefined, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(MSADS_RETRY_CONFIG, {
        url,
        fetchOptions: { ...options, method },
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        mapStatusCode: mapMsAdsStatusCode,
        throttleDelayMs: msadsThrottleDelayMs,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            Authorization: `Bearer ${accessToken}`,
            DeveloperToken: this.authAdapter.developerToken,
            CustomerId: this.authAdapter.customerId,
            CustomerAccountId: this.authAdapter.accountId,
            "Content-Type": "application/json",
          };
        },
      });
    });
  }
}
