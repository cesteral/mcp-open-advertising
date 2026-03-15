// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { TikTokAuthAdapter } from "../../auth/tiktok-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout, buildMultipartFormData, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withTikTokApiSpan } from "../../utils/telemetry/tracing.js";

const TIKTOK_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "TikTok",
  tokenExpiryHint: "TikTok token expired. Regenerate in TikTok Business Center.",
};

/** TikTok standard API response shape */
interface TikTokApiResponse {
  code: number;
  message: string;
  data: unknown;
  request_id?: string;
}

/** TikTok error codes that indicate token expiry or auth failure */
const AUTH_ERROR_CODES = new Set([40001, 40002, 40013]);

/** TikTok error codes that indicate rate limiting */
const RATE_LIMIT_CODES = new Set([40100, 40101]);

function mapTikTokErrorToJsonRpc(tiktokCode: number, httpStatus: number): JsonRpcErrorCode {
  if (AUTH_ERROR_CODES.has(tiktokCode) || httpStatus === 401) {
    return JsonRpcErrorCode.Unauthorized;
  }
  if (RATE_LIMIT_CODES.has(tiktokCode) || httpStatus === 429) {
    return JsonRpcErrorCode.RateLimited;
  }
  if (httpStatus === 403) {
    return JsonRpcErrorCode.Forbidden;
  }
  if (httpStatus >= 500 || tiktokCode >= 50000) {
    return JsonRpcErrorCode.ServiceUnavailable;
  }
  return JsonRpcErrorCode.InvalidRequest;
}

/**
 * Validate the TikTok response envelope.
 * Returns `json.data` on success (code === 0).
 * Throws McpError on failure, with `retryable = true` for rate-limit codes.
 */
function validateTikTokEnvelope(body: unknown): unknown {
  const json = body as TikTokApiResponse;
  if (json.code === 0) {
    return json.data;
  }

  const jsonRpcCode = mapTikTokErrorToJsonRpc(json.code, 200);
  const retryable = RATE_LIMIT_CODES.has(json.code);

  throw new McpError(
    jsonRpcCode,
    json.message || `TikTok API error: code=${json.code}`,
    {
      tiktokCode: json.code,
      tiktokRequestId: json.request_id,
      retryable,
    }
  );
}

/**
 * HTTP client for TikTok Marketing API requests.
 *
 * Handles authentication via Bearer token, automatic advertiser_id injection,
 * retry with exponential backoff, and TikTok-specific error parsing.
 *
 * Key TikTok patterns:
 * - GET requests: advertiser_id goes in query params
 * - POST requests: advertiser_id goes in JSON body
 * - DELETE requests: advertiser_id goes in JSON body
 * - Response shape: { code: 0, message: "OK", data: {...} }
 */
export class TikTokHttpClient {
  constructor(
    private readonly authAdapter: TikTokAuthAdapter,
    private readonly advertiserId: string,
    private readonly baseUrl: string,
    private readonly logger: Logger
  ) {}

  /**
   * Make an authenticated GET request.
   * advertiser_id is automatically injected into query params.
   */
  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path, {
      advertiser_id: this.advertiserId,
      ...params,
    });
    return this.executeRequest(url, context, { method: "GET" });
  }

  /**
   * Make an authenticated POST request with JSON body.
   * advertiser_id is automatically injected into the body.
   */
  async post(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify({
      advertiser_id: this.advertiserId,
      ...data,
    });

    return this.executeRequest(url, context, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
  }

  /**
   * Make an authenticated DELETE request with JSON body.
   * advertiser_id is automatically injected into the body.
   */
  async delete(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify({
      advertiser_id: this.advertiserId,
      ...data,
    });

    return this.executeRequest(url, context, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
  }

  /**
   * Make an authenticated POST request with multipart/form-data body.
   * Used for media uploads (images, videos) to TikTok Marketing API.
   * advertiser_id is automatically included as a form field.
   */
  async postMultipart(
    path: string,
    fields: Record<string, string>,
    fileField: string,
    fileBuffer: Buffer,
    filename: string,
    fileContentType: string,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);

    return withTikTokApiSpan("api.multipart.POST", path, async (span) => {
      span.setAttribute("http.request.method", "POST");
      span.setAttribute("http.url", url);
      const allFields = { advertiser_id: this.advertiserId, ...fields };
      const { body, contentType } = buildMultipartFormData(allFields, fileField, fileBuffer, filename, fileContentType);
      const timeoutMs = TIKTOK_RETRY_CONFIG.timeoutMs ?? 30_000;
      const accessToken = await this.authAdapter.getAccessToken();
      const response = await fetchWithTimeout(url, timeoutMs, context, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": contentType,
        },
        body,
      });
      span.setAttribute("http.response.status_code", response.status);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new McpError(
          mapTikTokErrorToJsonRpc(0, response.status),
          `TikTok API HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`,
          { requestId: context?.requestId, httpStatus: response.status, url }
        );
      }
      const json = (await response.json()) as TikTokApiResponse;
      if (json.code !== 0) {
        throw new McpError(
          mapTikTokErrorToJsonRpc(json.code, response.status),
          json.message || `TikTok API error: code=${json.code}`,
          { requestId: context?.requestId, tiktokCode: json.code, url }
        );
      }
      return json.data;
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

    return withTikTokApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(TIKTOK_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          };
        },
        validateResponseBody: validateTikTokEnvelope,
      });
    });
  }
}