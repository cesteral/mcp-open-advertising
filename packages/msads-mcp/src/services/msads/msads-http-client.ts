// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { MsAdsAuthAdapter } from "../../auth/msads-auth-adapter.js";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withMsAdsApiSpan } from "../../utils/telemetry/tracing.js";

const MSADS_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Microsoft Ads",
  tokenExpiryHint: "Microsoft Ads token expired. Regenerate via Microsoft identity platform.",
};

/**
 * HTTP client for Microsoft Advertising REST API v13.
 *
 * All requests include 4 auth headers:
 * - AuthenticationToken: OAuth2 access token
 * - DeveloperToken: per-app developer token
 * - CustomerId: manager account ID
 * - CustomerAccountId: ad account ID
 *
 * Microsoft Ads REST API patterns:
 * - Most operations use POST (even reads like GetCampaignsByAccountId)
 * - GET is used for some simple lookups
 * - Response is plain JSON (no wrapper envelope)
 * - Errors: { TrackingId, Type, Message, ErrorCode }
 */
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
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            AuthenticationToken: accessToken,
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