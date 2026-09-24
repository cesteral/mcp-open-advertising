// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TikTok Auth Adapters
 *
 * Two adapter implementations:
 * 1. TikTokAccessTokenAdapter — holds a pre-generated access token.
 * 2. TikTokRefreshTokenAdapter — rejects refresh-token credentials with a
 *    clear Unauthorized error: TikTok documents no refresh endpoint (see
 *    TIKTOK_REFRESH_UNSUPPORTED_MESSAGE).
 *
 * Validates tokens by calling GET /open_api/{version}/user/info/.
 * The token is sent upstream in TikTok's `Access-Token` header (see
 * TIKTOK_ACCESS_TOKEN_HEADER). Inbound, MCP clients still present it to this
 * server as `Authorization: Bearer <token>` — only the outbound header differs.
 */

import {
  extractHeader,
  fetchWithTimeout,
  fingerprintCredentials,
  JsonRpcErrorCode,
  McpError,
} from "@cesteral/shared";
import { TIKTOK_ACCESS_TOKEN_HEADER } from "../services/tiktok/tiktok-http-client.js";

/**
 * TikTok API response shape (success)
 */
interface TikTokUserInfoResponse {
  code: number;
  message: string;
  data?: {
    display_name?: string;
    email?: string;
  };
}

/**
 * Contract for TikTok authentication adapters.
 */
export interface TikTokAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly advertiserId: string;
}

/**
 * Validate a TikTok access token against GET /open_api/{version}/user/info/
 * and return the authenticated user's display name (falling back to email or
 * "unknown"). Throws Unauthorized on HTTP failure or non-zero TikTok code.
 */
async function fetchTikTokUserId(
  token: string,
  baseUrl: string,
  apiVersion: string
): Promise<string> {
  const response = await fetchWithTimeout(
    `${baseUrl}/open_api/${apiVersion}/user/info/`,
    10_000,
    undefined,
    {
      method: "GET",
      headers: { [TIKTOK_ACCESS_TOKEN_HEADER]: token },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new McpError(
      JsonRpcErrorCode.Unauthorized,
      `TikTok token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
    );
  }

  const data = (await response.json()) as TikTokUserInfoResponse;

  if (data.code !== 0) {
    throw new McpError(
      JsonRpcErrorCode.Unauthorized,
      `TikTok token validation failed: code=${data.code} message=${data.message}`
    );
  }

  return data.data?.display_name ?? data.data?.email ?? "unknown";
}

/**
 * Simple access token adapter — holds a pre-generated TikTok access token.
 * Validates the token on first use by calling GET /open_api/{version}/user/info/.
 */
export class TikTokAccessTokenAdapter implements TikTokAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _advertiserId: string,
    private readonly baseUrl: string = "https://business-api.tiktok.com",
    private readonly apiVersion: string = "v1.3"
  ) {}

  get userId(): string {
    return this._userId;
  }

  get advertiserId(): string {
    return this._advertiserId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async validate(): Promise<void> {
    if (this.validated) return;
    this._userId = await fetchTikTokUserId(this.accessToken, this.baseUrl, this.apiVersion);
    this.validated = true;
  }
}

/**
 * TikTok OAuth2 refresh token credentials.
 */
export interface TikTokRefreshCredentials {
  appId: string;
  appSecret: string;
  refreshToken: string;
}

/**
 * Why there is no working refresh flow.
 *
 * The only token endpoint in TikTok's official SDK
 * (github.com/tiktok/tiktok-business-api-sdk) is `POST oauth2/access_token/`,
 * whose body is `{ app_id, secret, auth_code }` with all three required
 * (python_sdk/docs/Oauth2AccessTokenBody.md). It exchanges a one-time
 * authorization code; it has no `grant_type`/`refresh_token` fields, and no
 * refresh endpoint appears anywhere in the SDK's 202 specs. This adapter used
 * to POST `grant_type=refresh_token` there, which that body schema cannot
 * accept (`auth_code` missing).
 *
 * Rather than keep calling an endpoint with a body it does not take, the
 * refresh branch now fails at session establishment with an explicit
 * Unauthorized error that says what to do instead.
 */
export const TIKTOK_REFRESH_UNSUPPORTED_MESSAGE =
  "TikTok refresh-token authentication is not supported: TikTok's documented token endpoint " +
  "(POST /open_api/v1.3/oauth2/access_token/) only exchanges an authorization code " +
  "(app_id, secret, auth_code) and no refresh-token endpoint is documented in TikTok's " +
  "official Business API SDK. Supply a TikTok access token instead (Authorization: Bearer " +
  "<token> with X-TikTok-Advertiser-Id, or TIKTOK_ACCESS_TOKEN + TIKTOK_ADVERTISER_ID).";

/**
 * Refresh-token adapter — retained so the X-TikTok-App-Id/-App-Secret/
 * -Refresh-Token headers and TIKTOK_APP_ID/_APP_SECRET/_REFRESH_TOKEN env vars
 * produce a clear error instead of an opaque upstream failure. Makes no
 * network calls; see TIKTOK_REFRESH_UNSUPPORTED_MESSAGE.
 */
export class TikTokRefreshTokenAdapter implements TikTokAuthAdapter {
  constructor(
    _credentials: TikTokRefreshCredentials,
    private readonly _advertiserId: string,
    _baseUrl: string = "https://business-api.tiktok.com",
    _apiVersion: string = "v1.3"
  ) {}

  get userId(): string {
    return "";
  }

  get advertiserId(): string {
    return this._advertiserId;
  }

  async getAccessToken(): Promise<string> {
    throw new McpError(JsonRpcErrorCode.Unauthorized, TIKTOK_REFRESH_UNSUPPORTED_MESSAGE);
  }

  async validate(): Promise<void> {
    throw new McpError(JsonRpcErrorCode.Unauthorized, TIKTOK_REFRESH_UNSUPPORTED_MESSAGE);
  }
}

/**
 * Parse TikTok refresh token credentials from HTTP headers.
 * Expects X-TikTok-App-Id, X-TikTok-App-Secret, X-TikTok-Refresh-Token headers.
 */
export function parseTikTokRefreshCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): TikTokRefreshCredentials | undefined {
  const appId = extractHeader(headers, "x-tiktok-app-id");
  const appSecret = extractHeader(headers, "x-tiktok-app-secret");
  const refreshToken = extractHeader(headers, "x-tiktok-refresh-token");

  if (!appId || !appSecret || !refreshToken) {
    return undefined;
  }

  return { appId, appSecret, refreshToken };
}

/**
 * Parse TikTok access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseTikTokTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const authHeader = extractHeader(headers, "authorization");

  if (!authHeader) {
    throw new Error("Missing required Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new Error("Authorization header must use Bearer scheme");
  }

  return match[1];
}

/**
 * Extract TikTok advertiser ID from HTTP headers.
 * Expects `X-TikTok-Advertiser-Id: <id>` header.
 */
export function getTikTokAdvertiserIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const advertiserId = extractHeader(headers, "x-tiktok-advertiser-id");

  if (!advertiserId) {
    throw new Error("Missing required X-TikTok-Advertiser-Id header");
  }

  return advertiserId;
}

/**
 * Generate a fingerprint for a TikTok access token + advertiser ID pair (for session binding).
 */
export function getTikTokCredentialFingerprint(accessToken: string, advertiserId: string): string {
  return fingerprintCredentials(accessToken, advertiserId);
}
