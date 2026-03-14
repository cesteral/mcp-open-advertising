import type { MsAdsAuthAdapter } from "../../auth/msads-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withMsAdsApiSpan, setSpanAttribute } from "../../utils/telemetry/tracing.js";

const MSADS_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Microsoft Ads",
};

function mapHttpStatusToJsonRpc(httpStatus: number): JsonRpcErrorCode {
  if (httpStatus === 401) return JsonRpcErrorCode.Unauthorized;
  if (httpStatus === 403) return JsonRpcErrorCode.Forbidden;
  if (httpStatus === 429) return JsonRpcErrorCode.RateLimited;
  if (httpStatus >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  return JsonRpcErrorCode.InvalidRequest;
}

function isRetryableStatus(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500;
}

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
    private readonly baseUrl: string
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
      headers: { "Content-Type": "application/json" },
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
    return withMsAdsApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return this.executeRequestInner(url, method, context, options);
    });
  }

  private async executeRequestInner(
    url: string,
    method: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const maxRetries = MSADS_RETRY_CONFIG.maxRetries ?? 3;
    const timeoutMs = MSADS_RETRY_CONFIG.timeoutMs ?? 30_000;

    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      const response = await fetchWithTimeout(
        url,
        timeoutMs,
        context,
        {
          ...options,
          method,
          headers: {
            AuthenticationToken: accessToken,
            DeveloperToken: this.authAdapter.developerToken,
            CustomerId: this.authAdapter.customerId,
            CustomerAccountId: this.authAdapter.accountId,
            "Content-Type": "application/json",
            ...options?.headers,
          },
        }
      );

      setSpanAttribute("http.response.status_code", response.status);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const mcpError = new McpError(
          mapHttpStatusToJsonRpc(response.status),
          `Microsoft Ads API HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`,
          { requestId: context?.requestId, httpStatus: response.status, url, method, attempt }
        );

        if (!isRetryableStatus(response.status) || attempt >= maxRetries) {
          throw mcpError;
        }

        lastError = mcpError;
        await this.sleep(this.calculateBackoff(attempt, response));
        continue;
      }

      return response.json();
    }

    throw (
      lastError ??
      new McpError(JsonRpcErrorCode.InternalError, "Unexpected retry loop exit", { requestId: context?.requestId })
    );
  }

  private calculateBackoff(attempt: number, response: Response): number {
    const initialBackoffMs = MSADS_RETRY_CONFIG.initialBackoffMs ?? 2_000;
    const maxBackoffMs = MSADS_RETRY_CONFIG.maxBackoffMs ?? 30_000;

    let delayMs = Math.min(initialBackoffMs * Math.pow(2, attempt), maxBackoffMs);

    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const retryAfterSeconds = parseInt(retryAfter, 10);
      if (!isNaN(retryAfterSeconds)) {
        delayMs = Math.min(retryAfterSeconds * 1000, maxBackoffMs);
      }
    }

    return delayMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
