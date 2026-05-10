// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { SnapchatAuthAdapter } from "../../auth/snapchat-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { fetchWithTimeout, buildMultipartFormData, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withSnapchatApiSpan } from "../../utils/platform.js";

const SNAPCHAT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Snapchat",
  tokenExpiryHint: "Snapchat token expired. Regenerate in Snap Business Manager.",
};

/** Snapchat response envelope shape */
interface SnapchatEnvelope {
  request_status: string;
  status?: string;
  request_id?: string;
  display_message?: string;
  error_code?: number;
  [key: string]: unknown;
}

function buildSnapchatEnvelopeNextAction(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (/access.?token|unauthor/i.test(message)) {
    return "Renew the Snapchat access token in Snap Business Manager and update SNAPCHAT_ACCESS_TOKEN.";
  }
  if (/permission|forbidden|access denied/i.test(message)) {
    return "Verify the user has Ad Account access in Snap Business Manager and the token includes snapchat-marketing-api scope.";
  }
  if (/ad.?account|advertiser/i.test(message)) {
    return "Verify the ad_account_id with snapchat_list_ad_accounts; the authenticated user may not have access.";
  }
  return undefined;
}

function buildSnapchatHttpNextAction(
  status: number,
  _errorBody: string,
  defaultHint: string | undefined
): string | undefined {
  if (status === 401) {
    return "Renew the Snapchat access token in Snap Business Manager and update SNAPCHAT_ACCESS_TOKEN.";
  }
  if (status === 403) {
    return "Verify the user has Ad Account access in Snap Business Manager. The token must include snapchat-marketing-api scope.";
  }
  if (status === 404) {
    return "Verify entity IDs with snapchat_list_entities or snapchat_list_ad_accounts.";
  }
  return defaultHint;
}

/**
 * Validate the Snapchat response envelope.
 * Returns the full envelope on success, throws McpError on FAILED status.
 */
function validateSnapchatEnvelope(body: unknown): unknown {
  const json = body as SnapchatEnvelope;
  const requestStatus =
    typeof json.request_status === "string"
      ? json.request_status.toUpperCase()
      : typeof json.status === "string"
        ? json.status.toUpperCase()
        : undefined;

  if (requestStatus !== "FAILED") {
    return json;
  }

  const nextAction = buildSnapchatEnvelopeNextAction(json.display_message);

  throw new McpError(
    JsonRpcErrorCode.InvalidRequest,
    json.display_message ?? `Snapchat API error: request_status=FAILED`,
    {
      errorCode: json.error_code,
      ...(nextAction ? { nextAction } : {}),
    }
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
      const { body, contentType } = buildMultipartFormData(
        fields,
        fileField,
        fileBuffer,
        filename,
        fileContentType
      );

      const result = await executeWithRetry(SNAPCHAT_RETRY_CONFIG, {
        url,
        fetchOptions: { method: "POST", body },
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType,
          };
        },
        validateResponseBody: validateSnapchatEnvelope,
        buildNextAction: buildSnapchatHttpNextAction,
      });
      span.setAttribute("http.response.status_code", 200);
      return result;
    });
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url =
      path.startsWith("http://") || path.startsWith("https://")
        ? new URL(path)
        : new URL(`${this.baseUrl}${path}`);
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
          const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
          };
          // Only include Content-Type for requests with a body (POST/PUT)
          if (options?.body) {
            headers["Content-Type"] = "application/json";
          }
          return headers;
        },
        validateResponseBody: validateSnapchatEnvelope,
        buildNextAction: buildSnapchatHttpNextAction,
      });
    });
  }
}
