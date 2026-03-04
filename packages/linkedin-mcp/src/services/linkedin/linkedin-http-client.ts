import type { Logger } from "pino";
import type { LinkedInAuthAdapter } from "../../auth/linkedin-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;

/** LinkedIn error response shape */
interface LinkedInApiError {
  serviceErrorCode?: number;
  message?: string;
  status?: number;
}

function isRetryableLinkedInError(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500;
}

function mapLinkedInErrorToJsonRpc(httpStatus: number): JsonRpcErrorCode {
  if (httpStatus === 429) {
    return JsonRpcErrorCode.RateLimited;
  }
  if (httpStatus === 401) {
    return JsonRpcErrorCode.Unauthorized;
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
 * HTTP client for LinkedIn Marketing API requests.
 *
 * Handles authentication via Bearer token in Authorization header,
 * LinkedIn-Version header injection, retry with exponential backoff,
 * and LinkedIn-specific error parsing and rate limit header logging.
 */
export class LinkedInHttpClient {
  constructor(
    private authAdapter: LinkedInAuthAdapter,
    private baseUrl: string,
    private apiVersion: string,
    private logger: Logger
  ) {}

  /**
   * Make an authenticated GET request to the LinkedIn API.
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
   * Make an authenticated POST request to the LinkedIn API.
   * LinkedIn expects JSON body for write operations.
   */
  async post(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeWithRetry(url, context, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Make an authenticated PATCH request to the LinkedIn API.
   * Used for partial updates with X-Restli-Method: PARTIAL_UPDATE.
   */
  async patch(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeWithRetry(url, context, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Restli-Method": "PARTIAL_UPDATE",
      },
      body: data !== undefined ? JSON.stringify({ patch: { "$set": data } }) : undefined,
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
    // LinkedIn uses full paths like /v2/adAccounts
    const baseUrlNoTrailing = this.baseUrl.replace(/\/$/, "");
    const url = new URL(`${baseUrlNoTrailing}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  /**
   * Encode a URN for use in a URL path segment.
   * e.g., "urn:li:sponsoredAccount:123" -> "%3Aurn%3Ali%3AsponssoredAccount%3A123"
   */
  static encodeUrn(urn: string): string {
    return encodeURIComponent(urn);
  }

  private async executeWithRetry(
    url: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": this.apiVersion,
        "X-Restli-Protocol-Version": "2.0.0",
        ...(options?.headers as Record<string, string> | undefined),
      };

      const response = await fetchWithTimeout(
        url,
        30_000,
        context,
        {
          ...options,
          headers,
        },
        undefined
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
      let linkedInError: LinkedInApiError | undefined;
      try {
        linkedInError = JSON.parse(errorBody) as LinkedInApiError;
      } catch {
        // Not JSON — use raw error body
      }

      const jsonRpcCode = mapLinkedInErrorToJsonRpc(response.status);
      const errorMessage =
        linkedInError?.message ??
        `LinkedIn API request failed: ${response.status}`;

      const mcpError = new McpError(
        jsonRpcCode,
        errorMessage,
        {
          requestId: context?.requestId,
          httpStatus: response.status,
          url,
          method: options?.method ?? "GET",
          serviceErrorCode: linkedInError?.serviceErrorCode,
          attempt,
        }
      );

      if (!isRetryableLinkedInError(response.status) || attempt >= MAX_RETRIES) {
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
          url,
          method: options?.method ?? "GET",
          status: response.status,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs,
          requestId: context?.requestId,
        },
        "Retrying LinkedIn API request after transient error"
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
    const rateLimitLimit = response.headers.get("X-RateLimit-Limit");
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
    const rateLimitReset = response.headers.get("X-RateLimit-Reset");

    if (rateLimitLimit || rateLimitRemaining || rateLimitReset) {
      this.logger.debug(
        {
          requestId: context?.requestId,
          rateLimitLimit,
          rateLimitRemaining,
          rateLimitReset,
        },
        "LinkedIn API rate limit headers"
      );

      // Warn when less than 10 requests remaining
      if (rateLimitRemaining && parseInt(rateLimitRemaining, 10) < 10) {
        this.logger.warn(
          { rateLimitRemaining, requestId: context?.requestId },
          "LinkedIn API rate limit approaching threshold"
        );
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
