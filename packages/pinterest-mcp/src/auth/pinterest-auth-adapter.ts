// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Auth Adapters
 *
 * Two adapter implementations:
 * 1. PinterestAccessTokenAdapter — holds a pre-generated static access token.
 * 2. PinterestRefreshTokenAdapter — uses app credentials + refresh token to
 *    auto-refresh access tokens (24h expiry). Same caching + mutex pattern
 *    as TTD's TtdCredentialExchangeAuthAdapter.
 *
 * Validates tokens by calling GET /v5/user_account.
 * Token is passed via Authorization: Bearer <token> header.
 */

import { createHash } from "crypto";
import {
  extractHeader,
  fetchWithTimeout,
  JsonRpcErrorCode,
  McpError,
  OAuth2RefreshAdapterBase,
} from "@cesteral/shared";

/**
 * Pinterest v5 user account response shape
 */
interface PinterestUserAccountResponse {
  username: string;
  account_type: string;
}

/**
 * Contract for Pinterest authentication adapters.
 */
export interface PinterestAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly adAccountId: string;
}

/**
 * Simple access token adapter — holds a pre-generated Pinterest access token.
 * Validates the token on first use by calling GET /v5/user_account.
 */
export class PinterestAccessTokenAdapter implements PinterestAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _adAccountId: string,
    private readonly baseUrl: string = "https://api.pinterest.com"
  ) {}

  get userId(): string {
    return this._userId;
  }

  get adAccountId(): string {
    return this._adAccountId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  /**
   * Validate the access token by calling GET /v5/user_account.
   * Must be called before the adapter is used.
   */
  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    const response = await fetchWithTimeout(`${this.baseUrl}/v5/user_account`, 10_000, undefined, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(JsonRpcErrorCode.Unauthorized, `Pinterest token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as PinterestUserAccountResponse;

    this._userId = data.username ?? "unknown";
    this.validated = true;
  }
}

/**
 * Pinterest OAuth2 refresh token credentials.
 */
export interface PinterestRefreshCredentials {
  appId: string;
  appSecret: string;
  refreshToken: string;
}

/**
 * Refresh token adapter — uses app credentials + refresh token to obtain
 * and auto-refresh access tokens via Pinterest's OAuth2 endpoint.
 */
export class PinterestRefreshTokenAdapter
  extends OAuth2RefreshAdapterBase<PinterestRefreshCredentials>
  implements PinterestAuthAdapter
{
  private _userId = "";

  constructor(
    credentials: PinterestRefreshCredentials,
    private readonly _adAccountId: string,
    private readonly baseUrl: string = "https://api.pinterest.com"
  ) {
    super({
      platformName: "Pinterest",
      credentials,
      requestToken: async (refreshToken) => {
        const response = await fetchWithTimeout(
          "https://api.pinterest.com/v5/oauth/token",
          10_000,
          undefined,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${Buffer.from(`${credentials.appId}:${credentials.appSecret}`).toString("base64")}`,
            },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: refreshToken,
              scope: "ads:read,ads:write",
            }).toString(),
          }
        );
        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `Pinterest token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
          );
        }
        return (await response.json()) as {
          access_token?: string;
          expires_in?: number;
          refresh_token?: string;
        };
      },
    });
  }

  get userId(): string {
    return this._userId;
  }

  get adAccountId(): string {
    return this._adAccountId;
  }

  async validate(): Promise<void> {
    // Force a token exchange to validate credentials
    const token = await this.getAccessToken();

    // Validate the token against the Pinterest v5 user account endpoint
    const response = await fetchWithTimeout(`${this.baseUrl}/v5/user_account`, 10_000, undefined, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(JsonRpcErrorCode.InternalError, `Pinterest token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
    }

    const data = (await response.json()) as PinterestUserAccountResponse;

    this._userId = data.username ?? "unknown";
  }

}

/**
 * Parse Pinterest refresh token credentials from HTTP headers.
 * Expects X-Pinterest-App-Id, X-Pinterest-App-Secret, X-Pinterest-Refresh-Token headers.
 */
export function parsePinterestRefreshCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): PinterestRefreshCredentials | undefined {
  const appId = extractHeader(headers, "x-pinterest-app-id");
  const appSecret = extractHeader(headers, "x-pinterest-app-secret");
  const refreshToken = extractHeader(headers, "x-pinterest-refresh-token");

  if (!appId || !appSecret || !refreshToken) {
    return undefined;
  }

  return { appId, appSecret, refreshToken };
}

/**
 * Parse Pinterest access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parsePinterestTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const authHeader = extractHeader(headers, "authorization");

  if (!authHeader) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Missing required Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Authorization header must use Bearer scheme");
  }

  return match[1];
}

/**
 * Extract Pinterest advertiser ID from HTTP headers.
 * Expects `X-Pinterest-Advertiser-Id: <id>` header.
 */
export function getPinterestAdvertiserIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const adAccountId =
    extractHeader(headers, "x-pinterest-advertiser-id") ??
    extractHeader(headers, "X-Pinterest-Advertiser-Id");

  if (!adAccountId) {
    throw new McpError(JsonRpcErrorCode.InvalidRequest, "Missing required X-Pinterest-Advertiser-Id header");
  }

  return adAccountId;
}

/**
 * Generate a fingerprint for a Pinterest access token + advertiser ID pair (for session binding).
 */
export function getPinterestCredentialFingerprint(
  accessToken: string,
  adAccountId: string
): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${adAccountId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}
