// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { MetaAuthAdapter } from "../../auth/meta-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout, buildMultipartFormData } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withMetaApiSpan, setSpanAttribute } from "../../utils/telemetry/tracing.js";

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

const META_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Meta",
};

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
    return this.executeWithRetry(url, context, { method: "GET" });
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

    return this.executeWithRetry(url, context, {
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
  async delete(
    path: string,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeWithRetry(url, context, { method: "DELETE" });
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
    const { body, contentType } = buildMultipartFormData(fields, fileField, fileBuffer, filename, fileContentType);
    const url = this.buildUrl(path);
    return this.executeWithRetry(url, context, {
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

  private async executeWithRetry(
    url: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const method = options?.method || "GET";

    return withMetaApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return this.executeWithRetryInner(url, context, options);
    });
  }

  private async executeWithRetryInner(
    url: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const { maxRetries, initialBackoffMs, maxBackoffMs, timeoutMs } = META_RETRY_CONFIG as Required<typeof META_RETRY_CONFIG>;

    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      // Add access_token as query parameter (Meta standard pattern)
      const urlWithAuth = new URL(url);
      urlWithAuth.searchParams.set("access_token", accessToken);

      const response = await fetchWithTimeout(
        urlWithAuth.toString(),
        timeoutMs,
        context,
        {
          ...options,
          headers: {
            ...options?.headers,
          },
        },
        (u) => u.replace(/access_token=[^&]+/, "access_token=***")
      );

      // Log rate limit headers for observability
      this.logRateLimitHeaders(response, context);

      if (response.ok) {
        setSpanAttribute("http.response.status_code", response.status);
        if (response.status === 204) {
          return {};
        }
        return response.json();
      }

      const errorBody = await response.text().catch(() => "");
      let metaError: MetaApiError | undefined;
      try {
        metaError = JSON.parse(errorBody) as MetaApiError;
      } catch {
        // Not JSON — use raw error body
      }

      const metaCode = metaError?.error?.code ?? 0;
      const jsonRpcCode = mapMetaErrorToJsonRpc(metaCode, response.status);
      let errorMessage = metaError?.error?.message ?? `Meta API request failed: ${response.status}`;
      if (metaCode === 190 || response.status === 401) {
        errorMessage += "\n\nAction required: Meta access token expired. Generate a new token in Meta Business Suite or use a System User token.";
      }

      const redactedUrl = urlWithAuth.toString().replace(/access_token=[^&]+/, "access_token=***");
      const mcpError = new McpError(
        jsonRpcCode,
        errorMessage,
        {
          requestId: context?.requestId,
          httpStatus: response.status,
          url: redactedUrl,
          method: options?.method ?? "GET",
          metaCode,
          metaSubcode: metaError?.error?.error_subcode,
          metaType: metaError?.error?.type,
          fbtraceId: metaError?.error?.fbtrace_id,
          attempt,
          ...(metaCode === 190 || response.status === 401
            ? { tokenExpiryHint: "Meta access token expired. Generate a new token in Meta Business Suite or use a System User token." }
            : {}),
        }
      );

      if (!isRetryableMetaError(metaCode, response.status) || attempt >= maxRetries) {
        throw mcpError;
      }

      lastError = mcpError;

      let delayMs = Math.min(
        initialBackoffMs * Math.pow(2, attempt),
        maxBackoffMs
      );

      // Respect Retry-After header
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const retryAfterSeconds = parseInt(retryAfter, 10);
        if (!isNaN(retryAfterSeconds)) {
          delayMs = Math.min(retryAfterSeconds * 1000, maxBackoffMs);
        }
      }

      this.logger.warn(
        {
          url: redactedUrl,
          method: options?.method ?? "GET",
          status: response.status,
          metaCode,
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          requestId: context?.requestId,
        },
        "Retrying Meta API request after transient error"
      );

      await this.sleep(delayMs);
    }

    throw (
      lastError ??
      new McpError(JsonRpcErrorCode.InternalError, "Unexpected retry loop exit", {
        requestId: context?.requestId,
      })
    );
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

      // Warn at 80% usage
      const maxUsage = Math.max(
        businessUsage ? this.parseUsagePercent(businessUsage) : 0,
        appUsage ? this.parseUsagePercent(appUsage) : 0,
        adAccountUsage ? this.parseUsagePercent(adAccountUsage) : 0
      );

      if (maxUsage >= 80) {
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
      // x-app-usage format: { call_count, total_cputime, total_time }
      if (parsed.call_count !== undefined) {
        return Math.max(
          parsed.call_count ?? 0,
          parsed.total_cputime ?? 0,
          parsed.total_time ?? 0
        );
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}