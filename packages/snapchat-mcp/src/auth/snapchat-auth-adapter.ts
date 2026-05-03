// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Auth Adapters
 *
 * Two adapter implementations:
 * 1. SnapchatAccessTokenAdapter — holds a pre-generated static access token.
 * 2. SnapchatRefreshTokenAdapter — uses app credentials + refresh token to
 *    auto-refresh access tokens. Same caching + mutex pattern as TTD's
 *    TtdCredentialExchangeAuthAdapter.
 *
 * Validates tokens by calling GET /v1/me on the Snapchat Ads API.
 * Token refresh uses POST https://accounts.snapchat.com/login/oauth2/access_token
 * with a form-encoded body (standard OAuth2 flat response, no data wrapper).
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
 * Snapchat /v1/me response shape
 */
interface SnapchatMeResponse {
  request_status: string;
  me?: {
    id: string;
    display_name: string;
    email?: string;
  };
}

/**
 * Contract for Snapchat authentication adapters.
 */
export interface SnapchatAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly adAccountId: string;
  /** Snapchat organization ID — required for /v1/organizations/{orgId}/adaccounts */
  readonly orgId: string;
}

/**
 * Simple access token adapter — holds a pre-generated Snapchat access token.
 * Validates the token on first use by calling GET /v1/me.
 */
export class SnapchatAccessTokenAdapter implements SnapchatAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _adAccountId: string,
    private readonly baseUrl: string = "https://adsapi.snapchat.com",
    private readonly _orgId: string = ""
  ) {}

  get userId(): string {
    return this._userId;
  }

  get adAccountId(): string {
    return this._adAccountId;
  }

  get orgId(): string {
    return this._orgId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  /**
   * Validate the access token by calling GET /v1/me.
   * Must be called before the adapter is used.
   */
  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    const response = await fetchWithTimeout(`${this.baseUrl}/v1/me`, 10_000, undefined, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(JsonRpcErrorCode.Unauthorized, `Snapchat token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as SnapchatMeResponse;

    this._userId = data.me?.id ?? "unknown";
    this.validated = true;
  }
}

/**
 * Snapchat OAuth2 refresh token credentials.
 */
export interface SnapchatRefreshCredentials {
  appId: string;
  appSecret: string;
  refreshToken: string;
}

/**
 * Refresh token adapter — uses app credentials + refresh token to obtain
 * and auto-refresh access tokens via Snapchat's OAuth2 endpoint.
 */
export class SnapchatRefreshTokenAdapter
  extends OAuth2RefreshAdapterBase<SnapchatRefreshCredentials>
  implements SnapchatAuthAdapter
{
  private _userId = "";

  constructor(
    credentials: SnapchatRefreshCredentials,
    private readonly _adAccountId: string,
    private readonly baseUrl: string = "https://adsapi.snapchat.com",
    private readonly _orgId: string = ""
  ) {
    super({
      platformName: "Snapchat",
      credentials,
      requestToken: async (refreshToken) => {
        const response = await fetchWithTimeout(
          "https://accounts.snapchat.com/login/oauth2/access_token",
          10_000,
          undefined,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              client_id: credentials.appId,
              client_secret: credentials.appSecret,
              refresh_token: refreshToken,
            }).toString(),
          }
        );
        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `Snapchat token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
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

  get orgId(): string {
    return this._orgId;
  }

  async validate(): Promise<void> {
    // Force a token exchange to validate credentials
    const token = await this.getAccessToken();

    // Validate the token against the Snapchat /v1/me endpoint
    const response = await fetchWithTimeout(`${this.baseUrl}/v1/me`, 10_000, undefined, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(JsonRpcErrorCode.InternalError, `Snapchat token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
    }

    const data = (await response.json()) as SnapchatMeResponse;
    this._userId = data.me?.id ?? "unknown";
  }

}

/**
 * Parse Snapchat refresh token credentials from HTTP headers.
 * Expects X-Snapchat-App-Id, X-Snapchat-App-Secret, X-Snapchat-Refresh-Token headers.
 */
export function parseSnapchatRefreshCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): SnapchatRefreshCredentials | undefined {
  const appId = extractHeader(headers, "x-snapchat-app-id");
  const appSecret = extractHeader(headers, "x-snapchat-app-secret");
  const refreshToken = extractHeader(headers, "x-snapchat-refresh-token");

  if (!appId || !appSecret || !refreshToken) {
    return undefined;
  }

  return { appId, appSecret, refreshToken };
}

/**
 * Parse Snapchat access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseSnapchatTokenFromHeaders(
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
 * Extract Snapchat advertiser ID from HTTP headers.
 * Expects `X-Snapchat-Advertiser-Id: <id>` header.
 */
export function getSnapchatAdvertiserIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const adAccountId = extractHeader(headers, "x-snapchat-advertiser-id");

  if (!adAccountId) {
    throw new McpError(JsonRpcErrorCode.InvalidRequest, "Missing required X-Snapchat-Advertiser-Id header");
  }

  return adAccountId;
}

/**
 * Extract Snapchat organization ID from HTTP headers.
 * Expects `X-Snapchat-Org-Id: <id>` header (optional — only required for listAdAccounts).
 */
export function getSnapchatOrgIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  return extractHeader(headers, "x-snapchat-org-id") ?? "";
}

/**
 * Generate a fingerprint for a Snapchat access token + advertiser ID pair (for session binding).
 */
export function getSnapchatCredentialFingerprint(accessToken: string, adAccountId: string): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${adAccountId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}
