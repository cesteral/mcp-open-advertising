// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { MetaAuthAdapter } from "../../auth/meta-auth-adapter.js";
import { JsonRpcErrorCode } from "../../utils/errors/index.js";
import { executeWithRetry, fetchWithTimeout, buildMultipartFormData } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withMetaApiSpan } from "../../utils/telemetry/tracing.js";

/** Meta error response shape */
interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/** Rate limit error codes from Meta */
const RATE_LIMIT_CODES = new Set([4, 17, 32]);

/** Warn when any rate-limit usage header reaches this percentage. */
const RATE_LIMIT_WARNING_PERCENT = 80;

const META_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Meta",
  tokenExpiryHint:
    "Meta access token expired. Generate a new token in Meta Business Suite or use a System User token.",
};

function parseMetaCode(body: string): number {
  try {
    return (JSON.parse(body) as MetaApiError).error?.code ?? 0;
  } catch {
    return 0;
  }
}

function isRetryableMetaError(code: number, httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500 || RATE_LIMIT_CODES.has(code);
}

function mapMetaErrorToJsonRpc(metaCode: number, httpStatus: number): JsonRpcErrorCode {
  if (RATE_LIMIT_CODES.has(metaCode) || httpStatus === 429) {
    return JsonRpcErrorCode.RateLimited;
  }
  if (metaCode === 190 || httpStatus === 401) {
    return JsonRpcErrorCode.Unauthorized;
  }
  if (metaCode === 10 || httpStatus === 403) {
    return JsonRpcErrorCode.Forbidden;
  }
  if (httpStatus >= 500) {
    return JsonRpcErrorCode.ServiceUnavailable;
  }
  return JsonRpcErrorCode.InvalidRequest;
}

/**
 * HTTP client for Meta Graph API requests.
 *
 * Handles authentication via Bearer token, retry with exponential backoff,
 * and Meta-specific error parsing and rate limit header logging.
 */
export class MetaGraphApiClient {
  constructor(
    private authAdapter: MetaAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  /**
   * Make an authenticated GET request to the Meta Graph API.
   */
  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);
    return this.request(url, context, { method: "GET" });
  }

  /**
   * Make an authenticated POST request to the Meta Graph API.
   * Meta expects form-encoded data for write operations.
   */
  async post(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const formBody = this.buildFormBody(data);

    return this.request(url, context, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });
  }

  /**
   * Make an authenticated DELETE request.
   */
  async delete(path: string, context?: RequestContext): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.request(url, context, { method: "DELETE" });
  }

  /**
   * Make an authenticated POST request with multipart/form-data body.
   * Used for media uploads (images, videos) to Meta Graph API.
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
    const { body, contentType } = buildMultipartFormData(
      fields,
      fileField,
      fileBuffer,
      filename,
      fileContentType
    );
    const url = this.buildUrl(path);
    return this.request(url, context, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private buildFormBody(data?: Record<string, unknown>): string {
    if (!data) return "";
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") {
        params.set(key, JSON.stringify(value));
      } else {
        params.set(key, String(value));
      }
    }
    return params.toString();
  }

  private async request(
    url: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const method = options?.method || "GET";

    return withMetaApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(META_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: (u, timeout, ctx, opts) =>
          fetchWithTimeout(u, timeout, ctx, opts, (s) =>
            s.replace(/access_token=[^&]+/, "access_token=***")
          ),
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return { Authorization: `Bearer ${accessToken}` };
        },
        mapStatusCode: (status: number, body: string) =>
          mapMetaErrorToJsonRpc(parseMetaCode(body), status),
        parseErrorBody: (body: string) => {
          try {
            return (JSON.parse(body) as MetaApiError).error?.message ?? body.substring(0, 500);
          } catch {
            return body.substring(0, 500);
          }
        },
        isRetryable: (status: number, body: string) =>
          isRetryableMetaError(parseMetaCode(body), status),
        onResponse: (response: Response, ctx?: RequestContext) => {
          this.logRateLimitHeaders(response, ctx);
        },
        buildErrorData: (_status: number, body: string) => {
          try {
            const parsed = JSON.parse(body) as MetaApiError;
            return {
              metaCode: parsed.error?.code,
              metaSubcode: parsed.error?.error_subcode,
              metaType: parsed.error?.type,
              fbtraceId: parsed.error?.fbtrace_id,
            };
          } catch {
            return {};
          }
        },
      });
    });
  }

  private logRateLimitHeaders(response: Response, context?: RequestContext): void {
    const businessUsage = response.headers.get("x-business-use-case-usage");
    const appUsage = response.headers.get("x-app-usage");
    const adAccountUsage = response.headers.get("x-ad-account-usage");

    if (businessUsage || appUsage || adAccountUsage) {
      this.logger.debug(
        {
          requestId: context?.requestId,
          businessUsage: businessUsage ? this.parseUsagePercent(businessUsage) : undefined,
          appUsage: appUsage ? this.parseUsagePercent(appUsage) : undefined,
          adAccountUsage: adAccountUsage ? this.parseUsagePercent(adAccountUsage) : undefined,
        },
        "Meta API rate limit headers"
      );

      const maxUsage = Math.max(
        businessUsage ? this.parseUsagePercent(businessUsage) : 0,
        appUsage ? this.parseUsagePercent(appUsage) : 0,
        adAccountUsage ? this.parseUsagePercent(adAccountUsage) : 0
      );

      if (maxUsage >= RATE_LIMIT_WARNING_PERCENT) {
        this.logger.warn(
          { maxUsage, requestId: context?.requestId },
          "Meta API rate limit usage approaching threshold"
        );
      }
    }
  }

  private parseUsagePercent(headerValue: string): number {
    try {
      const parsed = JSON.parse(headerValue);
      // x-ad-account-usage format: { "percent_used": 83 }
      if (parsed.percent_used !== undefined) {
        return parsed.percent_used as number;
      }
      // x-app-usage format: { call_count, total_cputime, total_time }
      if (parsed.call_count !== undefined) {
        return Math.max(parsed.call_count ?? 0, parsed.total_cputime ?? 0, parsed.total_time ?? 0);
      }
      // x-business-use-case-usage format: { "<id>": [{ call_count, ... }] }
      for (const values of Object.values(parsed)) {
        if (Array.isArray(values) && values.length > 0) {
          const entry = values[0] as Record<string, number>;
          return Math.max(entry.call_count ?? 0, entry.total_cputime ?? 0, entry.total_time ?? 0);
        }
      }
    } catch {
      // Not parseable
    }
    return 0;
  }
}
