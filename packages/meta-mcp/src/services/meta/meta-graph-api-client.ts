import type { Logger } from "pino";
import type { MetaAuthAdapter } from "../../auth/meta-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;

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
    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      // Add access_token as query parameter (Meta standard pattern)
      const urlWithAuth = new URL(url);
      urlWithAuth.searchParams.set("access_token", accessToken);

      const response = await fetchWithTimeout(
        urlWithAuth.toString(),
        30_000,
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
      const errorMessage = metaError?.error?.message ?? `Meta API request failed: ${response.status}`;

      const mcpError = new McpError(
        jsonRpcCode,
        errorMessage,
        {
          requestId: context?.requestId,
          httpStatus: response.status,
          url: url.replace(/access_token=[^&]+/, "access_token=***"),
          method: options?.method ?? "GET",
          metaCode,
          metaSubcode: metaError?.error?.error_subcode,
          metaType: metaError?.error?.type,
          fbtraceId: metaError?.error?.fbtrace_id,
          attempt,
        }
      );

      if (!isRetryableMetaError(metaCode, response.status) || attempt >= MAX_RETRIES) {
        throw mcpError;
      }

      lastError = mcpError;

      let delayMs = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(2, attempt),
        MAX_BACKOFF_MS
      );

      // Respect Retry-After header
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const retryAfterSeconds = parseInt(retryAfter, 10);
        if (!isNaN(retryAfterSeconds)) {
          delayMs = Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS);
        }
      }

      this.logger.warn(
        {
          url: url.replace(/access_token=[^&]+/, "access_token=***"),
          method: options?.method ?? "GET",
          status: response.status,
          metaCode,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
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
