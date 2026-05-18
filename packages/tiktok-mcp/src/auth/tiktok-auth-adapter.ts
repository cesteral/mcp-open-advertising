// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TikTok Auth Adapters
 *
 * Two adapter implementations:
 * 1. TikTokAccessTokenAdapter — holds a pre-generated static access token.
 * 2. TikTokRefreshTokenAdapter — uses app credentials + refresh token to
 *    auto-refresh access tokens (24h expiry). Caching + single-flight refresh
 *    come from OAuth2RefreshAdapterBase in @cesteral/shared.
 *
 * Validates tokens by calling GET /open_api/{version}/user/info/.
 * Token is passed via Authorization: Bearer <token> header.
 */

import {
  extractHeader,
  fetchWithTimeout,
  fingerprintCredentials,
  JsonRpcErrorCode,
  McpError,
  OAuth2RefreshAdapterBase,
} from "@cesteral/shared";

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
      headers: { Authorization: `Bearer ${token}` },
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
 * TikTok wraps OAuth2 responses in a code+message envelope around `data`.
 */
interface TikTokTokenResponse {
  code: number;
  message: string;
  data?: {
    access_token: string;
    refresh_token?: string;
    expires_in: number; // seconds (typically 86400 = 24h)
  };
}

/**
 * Refresh token adapter — uses app credentials + refresh token to obtain
 * and auto-refresh access tokens via TikTok's OAuth2 endpoint.
 *
 * TikTok access tokens expire after 24 hours. Caching + single-flight refresh
 * live in OAuth2RefreshAdapterBase; this subclass unwraps TikTok's code+message
 * envelope and forwards the inner OAuth2 response to the base.
 */
export class TikTokRefreshTokenAdapter
  extends OAuth2RefreshAdapterBase<TikTokRefreshCredentials>
  implements TikTokAuthAdapter
{
  private _userId = "";

  constructor(
    credentials: TikTokRefreshCredentials,
    private readonly _advertiserId: string,
    private readonly baseUrl: string = "https://business-api.tiktok.com",
    private readonly apiVersion: string = "v1.3"
  ) {
    super({
      platformName: "TikTok",
      credentials,
      requestToken: async (refreshToken) => {
        const response = await fetchWithTimeout(
          `${baseUrl}/open_api/${apiVersion}/oauth2/access_token/`,
          10_000,
          undefined,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              app_id: credentials.appId,
              secret: credentials.appSecret,
              grant_type: "refresh_token",
              refresh_token: refreshToken,
            }),
          }
        );

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `TikTok token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
          );
        }

        const data = (await response.json()) as TikTokTokenResponse;
        if (data.code !== 0 || !data.data?.access_token) {
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `TikTok token refresh failed: code=${data.code} message=${data.message}`
          );
        }

        return {
          access_token: data.data.access_token,
          expires_in: data.data.expires_in,
          refresh_token: data.data.refresh_token,
        };
      },
    });
  }

  get userId(): string {
    return this._userId;
  }

  get advertiserId(): string {
    return this._advertiserId;
  }

  async validate(): Promise<void> {
    // Force a token exchange to validate credentials
    const token = await this.getAccessToken();
    this._userId = await fetchTikTokUserId(token, this.baseUrl, this.apiVersion);
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
