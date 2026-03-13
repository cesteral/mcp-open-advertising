import type { Logger } from "pino";
import type { AmazonDspAuthAdapter } from "../../auth/amazon-dsp-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withAmazonDspApiSpan, setSpanAttribute } from "../../utils/telemetry/tracing.js";

const AMAZON_DSP_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "AmazonDsp",
};

/** Amazon DSP error codes that indicate rate limiting */
const RATE_LIMIT_HTTP_STATUS = 429;

function isRetryableAmazonDspError(httpStatus: number): boolean {
  return httpStatus === RATE_LIMIT_HTTP_STATUS || httpStatus >= 500;
}

function mapAmazonDspErrorToJsonRpc(httpStatus: number): JsonRpcErrorCode {
  if (httpStatus === 401) {
    return JsonRpcErrorCode.Unauthorized;
  }
  if (httpStatus === RATE_LIMIT_HTTP_STATUS) {
    return JsonRpcErrorCode.RateLimited;
  }
  if (httpStatus === 403) {
    return JsonRpcErrorCode.Forbidden;
  }
  if (httpStatus >= 500) {
    return JsonRpcErrorCode.ServiceUnavailable;
  }
  return JsonRpcErrorCode.InvalidRequest;
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
 * - No DELETE endpoint — archive via PUT with { status: "ARCHIVED" }
 * - Offset pagination: startIndex + count query params
 */
export class AmazonDspHttpClient {
  constructor(
    private readonly authAdapter: AmazonDspAuthAdapter,
    private readonly profileId: string,
    private readonly baseUrl: string,
    private readonly logger: Logger,
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
   */
  async post(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});

    return this.executeRequest(url, context, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

  private buildAmazonHeaders(accessToken: string, extraHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Amazon-Advertising-API-Scope": this.profileId,
      ...extraHeaders,
    };

    if (this.clientId) {
      headers["Amazon-Advertising-API-ClientId"] = this.clientId;
    }

    return headers;
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
      return this.executeRequestInner(url, context, options);
    });
  }

  private async executeRequestInner(
    url: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const maxRetries = AMAZON_DSP_RETRY_CONFIG.maxRetries ?? 3;
    const timeoutMs = AMAZON_DSP_RETRY_CONFIG.timeoutMs ?? 30_000;

    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      const extraHeaders = (options?.headers as Record<string, string>) ?? {};
      const { "Content-Type": _ct, ...otherHeaders } = extraHeaders;
      const mergedHeaders = this.buildAmazonHeaders(accessToken, otherHeaders);
      if (_ct) {
        mergedHeaders["Content-Type"] = _ct;
      }

      const response = await fetchWithTimeout(
        url,
        timeoutMs,
        context,
        {
          ...options,
          headers: mergedHeaders,
        }
      );

      if (!response.ok) {
        // HTTP-level error
        const errorBody = await response.text().catch(() => "");
        const mcpError = new McpError(
          mapAmazonDspErrorToJsonRpc(response.status),
          `Amazon DSP API HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`,
          {
            requestId: context?.requestId,
            httpStatus: response.status,
            url,
            method: options?.method ?? "GET",
            attempt,
          }
        );

        if (!isRetryableAmazonDspError(response.status) || attempt >= maxRetries) {
          throw mcpError;
        }

        lastError = mcpError;
        await this.sleep(this.calculateBackoff(attempt, response));
        continue;
      }

      // Parse raw Amazon DSP JSON response (no envelope)
      setSpanAttribute("http.response.status_code", response.status);
      const json = await response.json();
      return json;
    }

    throw (
      lastError ??
      new McpError(JsonRpcErrorCode.InternalError, "Unexpected retry loop exit", {
        requestId: context?.requestId,
      })
    );
  }

  private calculateBackoff(attempt: number, response: Response): number {
    const initialBackoffMs = AMAZON_DSP_RETRY_CONFIG.initialBackoffMs ?? 2_000;
    const maxBackoffMs = AMAZON_DSP_RETRY_CONFIG.maxBackoffMs ?? 30_000;

    let delayMs = Math.min(
      initialBackoffMs * Math.pow(2, attempt),
      maxBackoffMs
    );

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
