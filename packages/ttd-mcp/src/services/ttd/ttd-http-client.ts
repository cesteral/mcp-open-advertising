import type { Logger } from "pino";
import type { TtdAuthAdapter } from "../../auth/ttd-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "../../utils/internal/request-context.js";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 10_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Shared HTTP client for TTD API requests.
 *
 * Delegates authentication to the injected TtdAuthAdapter (which handles
 * token caching, refresh, and mutex internally). Provides retry logic with
 * exponential backoff and consistent error handling.
 */
export class TtdHttpClient {
  constructor(
    private authAdapter: TtdAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  get partnerId(): string {
    return this.authAdapter.partnerId;
  }

  /**
   * Make an authenticated request to the TTD API.
   *
   * - Prepends `baseUrl` to `path`.
   * - Retries on 429 and 5xx with exponential backoff (respects Retry-After).
   * - Parses JSON or returns `{}` for 204 No Content.
   */
  async fetch(
    path: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;

    this.logger.debug(
      { url, method: options?.method || "GET", requestId: context?.requestId },
      "Making TTD API request"
    );

    return this.executeWithRetry(url, 10_000, context, options);
  }

  /**
   * Make an authenticated request to a full URL (not prepending baseUrl).
   *
   * Used for endpoints on a different host (e.g., GraphQL at desk.thetradedesk.com).
   * Same retry/auth logic as `fetch`.
   */
  async fetchDirect(
    fullUrl: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    this.logger.debug(
      { url: fullUrl, method: options?.method || "GET", requestId: context?.requestId },
      "Making TTD API request (direct URL)"
    );

    return this.executeWithRetry(fullUrl, 10_000, context, options);
  }

  private async executeWithRetry(
    url: string,
    timeoutMs: number,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      const response = await fetchWithTimeout(url, timeoutMs, context, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
          "TTD-Auth": accessToken,
        },
      });

      if (response.ok) {
        if (response.status === 204) {
          return {};
        }
        return response.json();
      }

      const errorBody = await response.text().catch(() => "");
      const mcpError = new McpError(
        response.status >= 500
          ? JsonRpcErrorCode.ServiceUnavailable
          : response.status === 429
            ? JsonRpcErrorCode.RateLimited
            : JsonRpcErrorCode.InvalidRequest,
        `TTD API request failed: ${response.status} ${response.statusText}`,
        {
          requestId: context?.requestId,
          httpStatus: response.status,
          url,
          method: options?.method ?? "GET",
          errorBody: errorBody.substring(0, 500),
          attempt,
        }
      );

      if (!isRetryableStatus(response.status) || attempt >= MAX_RETRIES) {
        throw mcpError;
      }

      lastError = mcpError;

      let delayMs = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(2, attempt),
        MAX_BACKOFF_MS
      );

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const retryAfterSeconds = parseInt(retryAfter, 10);
          if (!isNaN(retryAfterSeconds)) {
            delayMs = Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS);
          }
        }
      }

      this.logger.warn(
        {
          url,
          method: options?.method ?? "GET",
          status: response.status,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs,
          requestId: context?.requestId,
        },
        "Retrying TTD API request after transient error"
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
