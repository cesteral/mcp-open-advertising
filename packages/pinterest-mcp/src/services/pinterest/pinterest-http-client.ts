import type { Logger } from "pino";
import type { PinterestAuthAdapter } from "../../auth/pinterest-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout, buildMultipartFormData } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withPinterestApiSpan, setSpanAttribute } from "../../utils/telemetry/tracing.js";

const PINTEREST_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Pinterest",
};

/** HTTP status codes that indicate rate limiting */
const RATE_LIMIT_HTTP_STATUSES = new Set([429]);

function isRetryablePinterestError(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500;
}

function mapHttpStatusToJsonRpc(httpStatus: number): JsonRpcErrorCode {
  if (httpStatus === 401) {
    return JsonRpcErrorCode.Unauthorized;
  }
  if (RATE_LIMIT_HTTP_STATUSES.has(httpStatus)) {
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
 * HTTP client for Pinterest Marketing API v5 requests.
 *
 * Handles authentication via Bearer token, retry with exponential backoff,
 * and Pinterest-specific error parsing.
 *
 * Pinterest v5 uses standard HTTP status codes — NO { code, data } response envelope.
 * Successful responses return data at the top level (e.g. { items: [...], bookmark: "..." }).
 *
 * Key Pinterest v5 patterns:
 * - ad_account_id is in the URL path (interpolated before calling these methods)
 * - GET requests: additional filters go in query params
 * - POST/PATCH requests: body is an array of entity objects
 * - DELETE requests: entity IDs go in query params
 */
export class PinterestHttpClient {
  constructor(
    private readonly authAdapter: PinterestAuthAdapter,
    private readonly adAccountId: string,
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly apiVersion: string = "v5"
  ) {}

  /**
   * Expose the stored ad account ID (useful for callers that need it for path interpolation).
   */
  get accountId(): string {
    return this.adAccountId;
  }

  /**
   * Expose the API version (for reference and future use in path construction).
   */
  get version(): string {
    return this.apiVersion;
  }

  /**
   * Make an authenticated GET request.
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
   * Body can be an object or an array (Pinterest v5 create/update use array bodies).
   */
  async post(
    path: string,
    data?: unknown,
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
   * Make an authenticated PATCH request with JSON body.
   * Pinterest v5 uses PATCH for bulk updates (body is an array of partial entity objects).
   */
  async patch(
    path: string,
    data?: unknown,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});

    return this.executeRequest(url, context, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
  }

  /**
   * Make an authenticated DELETE request.
   * Pinterest v5 delete endpoints use query params for entity IDs (e.g. ?campaign_ids=123,456).
   */
  async delete(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);

    return this.executeRequest(url, context, {
      method: "DELETE",
    });
  }

  /**
   * Make an authenticated POST request with multipart/form-data body.
   * Used for media uploads (images, videos) to Pinterest Marketing API.
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

    return withPinterestApiSpan("api.multipart.POST", path, async (span) => {
      span.setAttribute("http.request.method", "POST");
      span.setAttribute("http.url", url);
      const { body, contentType } = buildMultipartFormData(fields, fileField, fileBuffer, filename, fileContentType);
      const timeoutMs = PINTEREST_RETRY_CONFIG.timeoutMs ?? 30_000;
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
      return this.parseResponse(response, url, context);
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

    return withPinterestApiSpan(`api.${method}`, url, async (span) => {
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
    const maxRetries = PINTEREST_RETRY_CONFIG.maxRetries ?? 3;
    const timeoutMs = PINTEREST_RETRY_CONFIG.timeoutMs ?? 30_000;

    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      const response = await fetchWithTimeout(
        url,
        timeoutMs,
        context,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
          `Pinterest API error ${response.status} ${response.statusText}: ${errorBody.substring(0, 500)}`,
          {
            requestId: context?.requestId,
            httpStatus: response.status,
            url,
            method: options?.method ?? "GET",
            attempt,
          }
        );

        if (!isRetryablePinterestError(response.status) || attempt >= maxRetries) {
          throw mcpError;
        }

        lastError = mcpError;

        this.logger.warn(
          {
            url,
            method: options?.method ?? "GET",
            httpStatus: response.status,
            attempt: attempt + 1,
            maxRetries,
            requestId: context?.requestId,
          },
          "Retrying Pinterest API request after transient error"
        );

        await this.sleep(this.calculateBackoff(attempt, response));
        continue;
      }

      // Pinterest v5: return the raw JSON body — no envelope to unwrap
      return response.json() as Promise<unknown>;
    }

    throw (
      lastError ??
      new McpError(JsonRpcErrorCode.InternalError, "Unexpected retry loop exit", {
        requestId: context?.requestId,
      })
    );
  }

  /**
   * Parse a Pinterest v5 API response.
   * Pinterest returns plain JSON with standard HTTP status codes — no { code, data } envelope.
   */
  private async parseResponse<T>(
    response: Response,
    url: string,
    context?: RequestContext
  ): Promise<T> {
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(
        mapHttpStatusToJsonRpc(response.status),
        `Pinterest API error ${response.status} ${response.statusText}: ${errorBody.substring(0, 500)}`,
        { requestId: context?.requestId, httpStatus: response.status, url }
      );
    }
    return response.json() as Promise<T>;
  }

  private calculateBackoff(attempt: number, response: Response): number {
    const initialBackoffMs = PINTEREST_RETRY_CONFIG.initialBackoffMs ?? 2_000;
    const maxBackoffMs = PINTEREST_RETRY_CONFIG.maxBackoffMs ?? 30_000;

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
