import type { SnapchatAuthAdapter } from "../../auth/snapchat-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout, buildMultipartFormData, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withSnapchatApiSpan } from "../../utils/telemetry/tracing.js";

const SNAPCHAT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Snapchat",
};

/** Snapchat response envelope shape */
interface SnapchatEnvelope {
  request_status: string;
  request_id?: string;
  display_message?: string;
  error_code?: number;
  [key: string]: unknown;
}

function mapHttpStatusToJsonRpc(httpStatus: number): JsonRpcErrorCode {
  if (httpStatus === 401) return JsonRpcErrorCode.Unauthorized;
  if (httpStatus === 403) return JsonRpcErrorCode.Forbidden;
  if (httpStatus === 429) return JsonRpcErrorCode.RateLimited;
  if (httpStatus >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  return JsonRpcErrorCode.InvalidRequest;
}

/**
 * Validate the Snapchat response envelope.
 * Returns the full envelope on success, throws McpError on FAILED status.
 */
function validateSnapchatEnvelope(body: unknown): unknown {
  const json = body as SnapchatEnvelope;
  if (json.request_status !== "FAILED") {
    return json;
  }

  throw new McpError(
    JsonRpcErrorCode.InvalidRequest,
    json.display_message ?? `Snapchat API error: request_status=FAILED`,
    { errorCode: json.error_code }
  );
}

/**
 * HTTP client for Snapchat Ads API requests.
 *
 * Handles authentication via Bearer token, retry with exponential backoff,
 * and Snapchat-specific response envelope parsing.
 *
 * Key Snapchat patterns:
 * - ad_account_id is in URL paths (not injected into query params or body)
 * - Response: { request_status: "SUCCESS"|"FAILED", <entityKey>s: [...] }
 * - Updates use PUT, deletes use DELETE on entity-specific paths
 */
export class SnapchatHttpClient {
  constructor(
    private readonly authAdapter: SnapchatAuthAdapter,
    private readonly baseUrl: string,
    private readonly logger: import("pino").Logger
  ) {}

  /** Make an authenticated GET request. Returns raw Snapchat envelope. */
  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);
    return this.executeRequest(url, context, { method: "GET" });
  }

  /** Make an authenticated POST request with JSON body. Returns raw Snapchat envelope. */
  async post(
    path: string,
    data?: Record<string, unknown> | unknown[],
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeRequest(url, context, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /** Make an authenticated PUT request with JSON body. Returns raw Snapchat envelope. */
  async put(
    path: string,
    data?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeRequest(url, context, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  /** Make an authenticated DELETE request. Returns raw Snapchat envelope. */
  async delete(
    path: string,
    _params?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeRequest(url, context, { method: "DELETE" });
  }

  /**
   * Make an authenticated POST request with multipart/form-data body.
   * Used for media uploads (images, videos) to Snapchat Marketing API.
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

    return withSnapchatApiSpan("api.multipart.POST", path, async (span) => {
      span.setAttribute("http.request.method", "POST");
      span.setAttribute("http.url", url);
      const { body, contentType } = buildMultipartFormData(fields, fileField, fileBuffer, filename, fileContentType);
      const timeoutMs = SNAPCHAT_RETRY_CONFIG.timeoutMs ?? 30_000;
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
          mapHttpStatusToJsonRpc(response.status),
          `Snapchat API HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`,
          { requestId: context?.requestId, httpStatus: response.status, url }
        );
      }

      const json = (await response.json()) as SnapchatEnvelope;
      if (json.request_status === "FAILED") {
        throw new McpError(
          JsonRpcErrorCode.InvalidRequest,
          json.display_message ?? `Snapchat API error: request_status=FAILED`,
          { requestId: context?.requestId, errorCode: json.error_code, url }
        );
      }

      return json;
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

    return withSnapchatApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(SNAPCHAT_RETRY_CONFIG, {
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
        validateResponseBody: validateSnapchatEnvelope,
      });
    });
  }
}
