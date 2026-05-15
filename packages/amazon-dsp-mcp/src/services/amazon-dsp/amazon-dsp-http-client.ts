// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspAuthAdapter } from "../../auth/amazon-dsp-auth-adapter.js";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withAmazonDspApiSpan } from "../../utils/platform.js";

// Amazon DSP returns bare `{"message":"Too Many Requests"}` on 429 with NO
// Retry-After header, so blind exponential retries just deepen the per-LwA-app
// quota burn (observed: a single 429 → 3 retries at 2s/4s/8s pushed the
// /dsp/orders endpoint into a multi-hour penalty window). Retry only on 5xx;
// surface 429 to the caller so the LLM agent can space requests out.
const AMAZON_DSP_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "AmazonDsp",
  tokenExpiryHint: "Amazon DSP token expired. Regenerate via Login with Amazon.",
};

function isAmazonDspRetryable(status: number, _errorBody: string): boolean {
  return status >= 500;
}

function buildAmazonDspNextAction(
  status: number,
  _errorBody: string,
  defaultHint: string | undefined
): string | undefined {
  if (status === 401) {
    return "Renew the Amazon DSP access token via Login with Amazon (LWA) using the configured refresh token, then update AMAZON_DSP_ACCESS_TOKEN.";
  }
  if (status === 403) {
    return "Verify the Amazon-Advertising-API-Scope (profileId) and ClientId headers correspond to a profile the user has access to. Use amazon_dsp_list_accounts to discover valid profileIds.";
  }
  if (status === 404) {
    return "Verify the order/lineItem/creative ID with amazon_dsp_list_entities and the accountId with amazon_dsp_list_accounts.";
  }
  if (status === 429) {
    return "Amazon DSP per-LwA-app quota tripped. Amazon does not send Retry-After; wait at least 5 minutes before retrying, and reduce request rate. /dsp/orders, /dsp/lineItems, /dsp/creatives have particularly tight rolling-window limits.";
  }
  return defaultHint;
}

/**
 * HTTP client for Amazon DSP Advertising API requests.
 *
 * Handles authentication via Bearer token, required Amazon API headers,
 * retry with exponential backoff, and error parsing.
 *
 * Key Amazon DSP patterns:
 * - ALL requests require Amazon-Advertising-API-Scope: {profileId} header
 * - ALL requests require Amazon-Advertising-API-ClientId: {clientId} header (when available)
 * - Response is raw JSON (no TikTok-style { code: 0, data: ... } envelope)
 * - No DELETE endpoint — archive via PUT with { state: "ARCHIVED" }
 * - Offset pagination: startIndex + count query params
 */
export class AmazonDspHttpClient {
  constructor(
    private readonly authAdapter: AmazonDspAuthAdapter,
    private readonly profileId: string,
    private readonly baseUrl: string,
    private readonly logger: import("pino").Logger
  ) {}

  /**
   * Make an authenticated GET request.
   * Amazon-Advertising-API-Scope is automatically injected as a header.
   */
  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext,
    accept?: string
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);
    const headers = accept ? { Accept: accept } : undefined;
    return this.executeRequest(url, context, { method: "GET", headers });
  }

  /**
   * Make an authenticated POST request with JSON body.
   *
   * Amazon's API gateway routes Bearer-authenticated DSP writes via
   * Content-Type negotiation. Sending plain `application/json` on
   * /dsp/orders, /dsp/lineItems, /dsp/creatives/* falls through to the
   * SigV4 auth path and returns 403 "Invalid key=value pair in
   * Authorization header". Each entity endpoint has a vendor media type
   * (e.g. application/vnd.dsporders.v2.2+json) that MUST be passed as
   * `contentType` for the request to land on the Bearer path.
   *
   * @param contentType - Override Content-Type. Defaults to application/json
   *                       (safe for non-DSP-entity paths like reporting).
   * @param accept      - Override Accept header. Defaults to contentType
   *                       (Amazon expects matching Accept on entity writes).
   */
  async post(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext,
    accept?: string,
    contentType?: string
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});
    const headers: Record<string, string> = {
      "Content-Type": contentType ?? "application/json",
    };
    if (accept) {
      headers.Accept = accept;
    } else if (contentType) {
      headers.Accept = contentType;
    }

    return this.executeRequest(url, context, {
      method: "POST",
      headers,
      body,
    });
  }

  /**
   * Make an authenticated PUT request with JSON body.
   * Used for updates and archive-based deletes. See `post` for the
   * Content-Type / SigV4 gateway routing background.
   */
  async put(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext,
    contentType?: string
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});
    const headers: Record<string, string> = {
      "Content-Type": contentType ?? "application/json",
    };
    if (contentType) {
      headers.Accept = contentType;
    }

    return this.executeRequest(url, context, {
      method: "PUT",
      headers,
      body,
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
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const method = options?.method || "GET";

    return withAmazonDspApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(AMAZON_DSP_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          const headers: Record<string, string> = {
            ...normalizeHeaders(options?.headers),
            Authorization: `Bearer ${accessToken}`,
            "Amazon-Advertising-API-Scope": this.profileId,
          };
          if (options?.body && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
          }
          const clientId = this.authAdapter.clientId;
          if (clientId) {
            headers["Amazon-Advertising-API-ClientId"] = clientId;
          }
          return headers;
        },
        buildNextAction: buildAmazonDspNextAction,
        isRetryable: isAmazonDspRetryable,
      });
    });
  }
}

function normalizeHeaders(headers?: RequestInit["headers"]): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return normalized;
}
