// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { PinterestAuthAdapter } from "../../auth/pinterest-auth-adapter.js";
import {
  fetchWithTimeout,
  buildMultipartFormData,
  executeWithRetry,
  McpError,
  mapHttpStatusToJsonRpc,
} from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withPinterestApiSpan } from "../../utils/platform.js";

export const PINTEREST_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Pinterest",
  tokenExpiryHint: "Pinterest token expired. Regenerate at developers.pinterest.com.",
};

function buildPinterestNextAction(
  status: number,
  _errorBody: string,
  defaultHint: string | undefined
): string | undefined {
  if (status === 401) {
    return "Renew the Pinterest access token. Regenerate it at https://developers.pinterest.com and update PINTEREST_ACCESS_TOKEN.";
  }
  if (status === 403) {
    return "Verify the token has ads:read / ads:write scopes and the user is admin/employee on the ad account.";
  }
  if (status === 404) {
    return "Verify the ad_account_id and entity IDs with pinterest_list_ad_accounts / pinterest_list_entities.";
  }
  return defaultHint;
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
 * - POST/PATCH to the campaign/ad group/ad batch endpoints: body is an array of
 *   entity objects; other endpoints (pins, media, reports, …) take an object
 * - DELETE exists only on single-entity paths (e.g. `/v5/pins/{pin_id}`);
 *   campaigns/ad groups/ads are archived via PATCH, never deleted
 * - Every POST goes through `executeRequest` with the shared default retry
 *   policy (429 retried for all methods; 5xx only for idempotent methods).
 *   Nothing here opts a POST into 5xx retry.
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
  async post(path: string, data?: unknown, context?: RequestContext): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});

    return this.executeRequest(url, context, {
      method: "POST",
      body,
    });
  }

  /**
   * Make an authenticated PATCH request with JSON body.
   * Pinterest v5 uses PATCH for bulk updates (body is an array of partial entity objects).
   */
  async patch(path: string, data?: unknown, context?: RequestContext): Promise<unknown> {
    const url = this.buildUrl(path);
    const body = JSON.stringify(data ?? {});

    return this.executeRequest(url, context, {
      method: "PATCH",
      body,
    });
  }

  /**
   * Make an authenticated DELETE request (single-entity paths, e.g. `/v5/pins/{pin_id}`).
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
   * Upload a file to an S3 pre-signed URL using the form parameters returned by POST /v5/media.
   * This is step 2 of Pinterest's two-step media upload — no Bearer token is used.
   */
  async uploadToS3(
    uploadUrl: string,
    uploadParameters: Record<string, string>,
    fileBuffer: Buffer,
    filename: string,
    fileContentType: string,
    context?: RequestContext
  ): Promise<void> {
    return withPinterestApiSpan("api.s3.upload", uploadUrl, async (span) => {
      span.setAttribute("http.request.method", "POST");
      span.setAttribute("http.url", uploadUrl);

      const { body, contentType } = buildMultipartFormData(
        uploadParameters,
        "file",
        fileBuffer,
        filename,
        fileContentType
      );

      const response = await fetchWithTimeout(uploadUrl, 120_000, context, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new McpError(
          mapHttpStatusToJsonRpc(response.status),
          `Pinterest S3 upload failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
        );
      }
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
      return executeWithRetry(PINTEREST_RETRY_CONFIG, {
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
          // Only include Content-Type for requests with a body (POST/PATCH)
          if (options?.body) {
            headers["Content-Type"] = "application/json";
          }
          return headers;
        },
        buildNextAction: buildPinterestNextAction,
      });
    });
  }
}
