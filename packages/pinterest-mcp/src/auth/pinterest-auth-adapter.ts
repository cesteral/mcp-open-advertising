/**
 * Pinterest Auth Adapters
 *
 * Two adapter implementations:
 * 1. PinterestAccessTokenAdapter — holds a pre-generated static access token.
 * 2. PinterestRefreshTokenAdapter — uses app credentials + refresh token to
 *    auto-refresh access tokens (24h expiry). Same caching + mutex pattern
 *    as TTD's TtdApiTokenAuthAdapter.
 *
 * Validates tokens by calling GET /v5/user_account.
 * Token is passed via Authorization: Bearer <token> header.
 */

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

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
    private readonly baseUrl: string = "https://business-api.pinterest.com"
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

    const response = await fetchWithTimeout(
      `${this.baseUrl}/v5/user_account`,
      10_000,
      undefined,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Pinterest token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
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
 * Pinterest OAuth2 token response shape (v5 standard OAuth2, no wrapper envelope).
 */
interface PinterestTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds (typically 2592000 = 30 days)
  refresh_token?: string;
  scope?: string;
}

/**
 * Refresh token adapter — uses app credentials + refresh token to obtain
 * and auto-refresh access tokens via Pinterest's OAuth2 endpoint.
 *
 * Pinterest access tokens expire after 24 hours. This adapter caches them
 * with a 60-second expiry buffer and uses a mutex to prevent concurrent
 * token requests (same pattern as TTD's TtdApiTokenAuthAdapter).
 */
export class PinterestRefreshTokenAdapter implements PinterestAuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;
  private _userId = "";
  private currentRefreshToken: string;

  private static readonly EXPIRY_BUFFER_MS = 60_000;

  constructor(
    private readonly credentials: PinterestRefreshCredentials,
    private readonly _adAccountId: string,
    private readonly baseUrl: string = "https://business-api.pinterest.com"
  ) {
    this.currentRefreshToken = credentials.refreshToken;
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
    const response = await fetchWithTimeout(
      `${this.baseUrl}/v5/user_account`,
      10_000,
      undefined,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Pinterest token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as PinterestUserAccountResponse;

    this._userId = data.username ?? "unknown";
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (this.pendingAuth) {
      return this.pendingAuth;
    }

    this.pendingAuth = this.refreshAccessToken();
    try {
      return await this.pendingAuth;
    } finally {
      this.pendingAuth = null;
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const b64 = Buffer.from(
      `${this.credentials.appId}:${this.credentials.appSecret}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.currentRefreshToken,
      scope: "ads:read,ads:write",
    }).toString();

    // Pinterest OAuth2 token endpoint is always on api.pinterest.com, regardless of this.baseUrl.
    // this.baseUrl controls the ad-entity API host (business-api.pinterest.com by default).
    const response = await fetchWithTimeout(
      "https://api.pinterest.com/v5/oauth/token",
      10_000,
      undefined,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${b64}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Pinterest token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as PinterestTokenResponse;
    if (!data.access_token) {
      throw new Error(
        `Pinterest token refresh failed: missing access_token in response`
      );
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      Date.now() + data.expires_in * 1000 - PinterestRefreshTokenAdapter.EXPIRY_BUFFER_MS;

    // Pinterest may rotate the refresh token — store the new one
    if (data.refresh_token) {
      this.currentRefreshToken = data.refresh_token;
    }

    return this.cachedToken;
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
    throw new Error("Missing required Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new Error("Authorization header must use Bearer scheme");
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
    throw new Error("Missing required X-Pinterest-Advertiser-Id header");
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
