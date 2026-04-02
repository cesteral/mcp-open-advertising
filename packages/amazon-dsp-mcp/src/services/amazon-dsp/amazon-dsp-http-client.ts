// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { AmazonDspAuthAdapter } from "../../auth/amazon-dsp-auth-adapter.js";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withAmazonDspApiSpan } from "../../utils/telemetry/tracing.js";

const AMAZON_DSP_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "AmazonDsp",
  tokenExpiryHint: "Amazon DSP token expired. Regenerate via Login with Amazon.",
};

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
    private readonly logger: import("pino").Logger,
    private readonly clientId?: string
  ) {}

  /**
   * Make an authenticated GET request.
   * Amazon-Advertising-API-Scope is automatically injected as a header.
   */
  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);
    return this.executeRequest(url, context, { method: "GET" });
  }

  /**
   * Make an authenticated POST request with JSON body.
   * @param contentType - Override Content-Type (e.g. for Reporting v3 API vendor media types)
   */
  async post(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext,
    contentType?: string
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});

    return this.executeRequest(url, context, {
      method: "POST",
      headers: {
        "Content-Type": contentType ?? "application/json",
      },
      body,
    });
  }

  /**
   * Make an authenticated PUT request with JSON body.
   * Used for updates and archive-based deletes.
   */
  async put(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});

    return this.executeRequest(url, context, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
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
          if (this.clientId) {
            headers["Amazon-Advertising-API-ClientId"] = this.clientId;
          }
          return headers;
        },
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
