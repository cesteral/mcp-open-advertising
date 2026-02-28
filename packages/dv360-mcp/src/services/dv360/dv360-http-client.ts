import type { Logger } from "pino";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";

/**
 * Retry configuration for transient errors (429 / 5xx).
 */
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 10_000;

/**
 * HTTP status codes that are eligible for retry.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Shared HTTP client for DV360 API requests.
 *
 * Delegates authentication to the injected GoogleAuthAdapter (which handles
 * token caching, refresh, and mutex internally). Provides retry logic with
 * exponential backoff and consistent error handling.
 */
export class DV360HttpClient {
  constructor(
    private authAdapter: GoogleAuthAdapter,
    private baseUrl: string,
    private logger: Logger
  ) {}

  /**
   * Derive the upload base URL from the configured base URL.
   *
   * For a base URL like `https://displayvideo.googleapis.com/v4`
   * the upload base is `https://displayvideo.googleapis.com/upload/displayvideo/v4`.
   */
  getUploadBaseUrl(): string {
    const parsed = new URL(this.baseUrl);
    // pathname is e.g. "/v4"
    return `${parsed.origin}/upload/displayvideo${parsed.pathname}`;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Make an authenticated request to the DV360 API.
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
      "Making DV360 API request"
    );

    return this.executeWithRetry(url, 10_000, context, options);
  }

  /**
   * Make an authenticated request with full caller control over the URL,
   * timeout, and options.
   *
   * Used by upload endpoints (e.g. custom bidding script/rules uploads)
   * that require absolute URLs and non-JSON content types.
   *
   * **No retry logic** is applied - the caller is responsible for error handling.
   */
  async fetchRaw(
    url: string,
    timeoutMs: number,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<Response> {
    const accessToken = await this.authAdapter.getAccessToken();

    return fetchWithTimeout(url, timeoutMs, context, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  // ==========================================================================
  // Retry logic
  // ==========================================================================

  /**
   * Execute a fetch request with exponential-backoff retry for transient errors.
   */
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
          ...options?.headers,
          Authorization: `Bearer ${accessToken}`,
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
        `DV360 API request failed: ${response.status} ${response.statusText}`,
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
        "Retrying DV360 API request after transient error"
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
