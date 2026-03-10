import type { Logger } from "pino";
import type { LinkedInAuthAdapter } from "../../auth/linkedin-auth-adapter.js";
import { JsonRpcErrorCode } from "../../utils/errors/index.js";
import { executeWithRetry, fetchWithTimeout, buildMultipartFormData } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withLinkedInApiSpan } from "../../utils/telemetry/tracing.js";

/** LinkedIn error response shape */
interface LinkedInApiError {
  serviceErrorCode?: number;
  message?: string;
  status?: number;
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

const LINKEDIN_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "LinkedIn",
};

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
    return this.request(url, context, { method: "GET" });
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
    return this.request(url, context, {
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
    return this.request(url, context, {
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
    return this.request(url, context, { method: "DELETE" });
  }

  /**
   * Make an authenticated POST request with multipart/form-data body.
   * LinkedIn-Version header is automatically added via the request() method.
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
    return this.request(url, context, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
  }

  /**
   * PUT binary data directly to a URL (for LinkedIn asset upload second step).
   * LinkedIn-Version and Auth headers are included.
   */
  async putBinary(
    uploadUrl: string,
    buffer: Buffer,
    contentType: string,
    context?: RequestContext
  ): Promise<void> {
    return withLinkedInApiSpan("api.binary.PUT", uploadUrl, async (span) => {
      span.setAttribute("http.request.method", "PUT");
      span.setAttribute("http.url", uploadUrl);
      const accessToken = await this.authAdapter.getAccessToken();
      const response = await fetchWithTimeout(uploadUrl, 300_000, context, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": contentType,
          "LinkedIn-Version": this.apiVersion,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: buffer,
      });
      span.setAttribute("http.response.status_code", response.status);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`LinkedIn binary PUT failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
      }
    });
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

  private async request(
    url: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const apiVersion = this.apiVersion;
    const method = options?.method || "GET";

    return withLinkedInApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      const result = await executeWithRetry(LINKEDIN_RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
          };
        },
        mapStatusCode: (status: number, _body: string) => mapLinkedInErrorToJsonRpc(status),
        parseErrorBody: (body: string) => {
          try {
            const parsed = JSON.parse(body) as LinkedInApiError;
            return parsed.message ?? body.substring(0, 500);
          } catch {
            return body.substring(0, 500);
          }
        },
      });
      return result;
    });
  }

}
