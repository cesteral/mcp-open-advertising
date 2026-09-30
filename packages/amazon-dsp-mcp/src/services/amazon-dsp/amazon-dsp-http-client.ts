// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspAuthAdapter } from "../../auth/amazon-dsp-auth-adapter.js";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withAmazonDspApiSpan } from "../../utils/platform.js";
import {
  AMAZON_ADS_V1_HEADERS,
  AMAZON_LEGACY_CLIENT_ID_HEADER,
  isAmazonAdsV1Path,
} from "./amazon-dsp-v1-api-contract.js";

// Amazon DSP returns bare `{"message":"Too Many Requests"}` on 429 with NO
// Retry-After header, so blind exponential retries just deepen the per-LwA-app
// quota burn (observed: a single 429 → 3 retries at 2s/4s/8s pushed the
// /dsp/orders endpoint into a multi-hour penalty window). Retry only on 5xx;
// surface 429 to the caller so the LLM agent can space requests out.
export const AMAZON_DSP_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "AmazonDsp",
  tokenExpiryHint: "Amazon DSP token expired. Regenerate via Login with Amazon.",
};

/**
 * Amazon DSP error-class check. Decides ONLY whether the failure is transient —
 * the shared layer independently decides whether the request is safe to
 * re-send, so this returning true for a 5xx no longer opts a POST create back
 * into retry (sweep 2026-07-25, 05-F3; previously up to four identical live
 * orders). To retry a POST here, set `retryNonIdempotent` explicitly.
 *
 * Note this deliberately omits 429, which predates the sweep and is unchanged.
 */
export function isAmazonDspRetryable(status: number, _errorBody: string): boolean {
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
    return "Verify the Amazon-Advertising-API-Scope (profileId) and ClientId headers correspond to a profile the user has access to. Profile IDs come from Amazon's GET /v2/profiles (this server has no profile-listing tool); use amazon_dsp_list_advertisers to confirm the profile can see the expected DSP advertisers.";
  }
  if (status === 404) {
    return "Verify the entity ID with amazon_dsp_list_entities and the accountId (the Amazon-Ads-AccountId / DSP advertiser ID) with amazon_dsp_list_advertisers.";
  }
  if (status === 429) {
    return "Amazon DSP per-LwA-app quota tripped. Amazon does not send Retry-After; wait at least 5 minutes before retrying, and reduce request rate.";
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
 * - Headers depend on the API family. Legacy `/dsp/*`, `/assets/*` and DSP
 *   reporting carry `Amazon-Advertising-API-Scope: {profileId}` and
 *   `Amazon-Advertising-API-ClientId`. The Unified API (`/adsApi/v1/*` —
 *   entity management since #234, commitments, forecasts) carries
 *   `Amazon-Ads-ClientId` and no scope header (see
 *   amazon-dsp-v1-api-contract.ts for the spec reference)
 * - Per-call headers (e.g. `Amazon-Ads-AccountId`) are passed via `extraHeaders`
 * - Response is raw JSON (no TikTok-style { code: 0, data: ... } envelope)
 */
export class AmazonDspHttpClient {
  constructor(
    private readonly authAdapter: AmazonDspAuthAdapter,
    private readonly profileId: string,
    private readonly baseUrl: string,
    private readonly logger: import("pino").Logger
  ) {}

  /**
   * Make an authenticated GET request. Auth, client-id and (legacy paths
   * only) scope headers are injected per request.
   */
  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext,
    accept?: string,
    extraHeaders?: Record<string, string>
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);
    const headers: Record<string, string> = { ...extraHeaders };
    if (accept) {
      headers.Accept = accept;
    }
    return this.executeRequest(path, url, context, { method: "GET", headers });
  }

  /**
   * Make an authenticated POST request with JSON body.
   *
   * The legacy `/dsp/orders` and `/dsp/lineItems` endpoints (still used for
   * the archive fallback, see `put`) route Bearer-authenticated writes via a
   * vendor media type (e.g. application/vnd.dsporders.v2.2+json) — plain
   * `application/json` there was observed to fall through to SigV4 and 403.
   * The Unified API (`/adsApi/v1/*`) is plain `application/json` throughout
   * (unified-api-dsp.json request bodies).
   *
   * @param contentType - Override Content-Type. Defaults to application/json.
   * @param accept      - Override Accept header. Defaults to contentType
   *                       (Amazon expects matching Accept on entity writes).
   * @param extraHeaders - Per-call headers (e.g. `Amazon-Ads-AccountId`).
   */
  async post(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext,
    accept?: string,
    contentType?: string,
    extraHeaders?: Record<string, string>
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});
    const headers: Record<string, string> = {
      ...extraHeaders,
      "Content-Type": contentType ?? "application/json",
    };
    if (accept) {
      headers.Accept = accept;
    } else if (contentType) {
      headers.Accept = contentType;
    }

    return this.executeRequest(path, url, context, {
      method: "POST",
      headers,
      body,
    });
  }

  /**
   * Make an authenticated PUT request with JSON body.
   * Since #234 used only for the LEGACY order / line-item archive
   * (`PUT /dsp/orders|lineItems/{id} { state: "ARCHIVED" }`) — the Unified
   * API has no archive for campaigns / ad groups. See `post` for the
   * vendor media type background.
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

    return this.executeRequest(path, url, context, {
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
    path: string,
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
          const v1 = isAmazonAdsV1Path(path);
          const headers: Record<string, string> = {
            ...normalizeHeaders(options?.headers),
            Authorization: `Bearer ${accessToken}`,
          };
          // The Unified API (`/adsApi/v1/*`) declares only Amazon-Ads-ClientId
          // and Amazon-Ads-AccountId (unified-api-dsp.json), and the DSP
          // migration guide §2 lists Amazon-Advertising-API-Scope as "Not used"
          // (amzn/ads-advanced-tools-docs @ e25aace0). Legacy `/dsp/*` and DSP
          // reporting keep the profile scope header.
          if (!v1) {
            headers["Amazon-Advertising-API-Scope"] = this.profileId;
          }
          if (options?.body && !headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
          }
          const clientId = this.authAdapter.clientId;
          if (clientId) {
            headers[v1 ? AMAZON_ADS_V1_HEADERS.clientId : AMAZON_LEGACY_CLIENT_ID_HEADER] =
              clientId;
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
