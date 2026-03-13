/**
 * Snapchat Auth Adapters
 *
 * Two adapter implementations:
 * 1. SnapchatAccessTokenAdapter — holds a pre-generated static access token.
 * 2. SnapchatRefreshTokenAdapter — uses app credentials + refresh token to
 *    auto-refresh access tokens. Same caching + mutex pattern as TTD's
 *    TtdApiTokenAuthAdapter.
 *
 * Validates tokens by calling GET /v1/me on the Snapchat Ads API.
 * Token refresh uses POST https://accounts.snapchat.com/login/oauth2/access_token
 * with a form-encoded body (standard OAuth2 flat response, no data wrapper).
 * Token is passed via Authorization: Bearer <token> header.
 */

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

/**
 * Snapchat /v1/me response shape
 */
interface SnapchatMeResponse {
  request_status: string;
  me: {
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
    private readonly baseUrl: string = "https://adsapi.snapchat.com"
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
   * Validate the access token by calling GET /v1/me.
   * Must be called before the adapter is used.
   */
  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}/v1/me`,
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
        `Snapchat token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
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
 * Snapchat OAuth2 token response shape (flat, no data wrapper).
 */
interface SnapchatTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Refresh token adapter — uses app credentials + refresh token to obtain
 * and auto-refresh access tokens via Snapchat's OAuth2 endpoint.
 *
 * Snapchat access tokens expire. This adapter caches them with a 60-second
 * expiry buffer and uses a mutex to prevent concurrent token requests (same
 * pattern as TTD's TtdApiTokenAuthAdapter).
 */
export class SnapchatRefreshTokenAdapter implements SnapchatAuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;
  private _userId = "";
  private currentRefreshToken: string;

  private static readonly EXPIRY_BUFFER_MS = 60_000;

  constructor(
    private readonly credentials: SnapchatRefreshCredentials,
    private readonly _adAccountId: string,
    private readonly baseUrl: string = "https://adsapi.snapchat.com"
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

    // Validate the token against the Snapchat /v1/me endpoint
    const response = await fetchWithTimeout(
      `${this.baseUrl}/v1/me`,
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
        `Snapchat token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as SnapchatMeResponse;
    this._userId = data.me?.id ?? "unknown";
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
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.credentials.appId,
      client_secret: this.credentials.appSecret,
      refresh_token: this.currentRefreshToken,
    }).toString();

    // Snapchat OAuth2 token endpoint is always on accounts.snapchat.com, regardless of this.baseUrl.
    // this.baseUrl controls the Ads API host (adsapi.snapchat.com by default).
    const response = await fetchWithTimeout(
      "https://accounts.snapchat.com/login/oauth2/access_token",
      10_000,
      undefined,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Snapchat token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as SnapchatTokenResponse;
    if (!data.access_token) {
      throw new Error(
        `Snapchat token refresh failed: missing access_token in response`
      );
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      Date.now() + data.expires_in * 1000 - SnapchatRefreshTokenAdapter.EXPIRY_BUFFER_MS;

    // Snapchat may rotate the refresh token — store the new one
    if (data.refresh_token) {
      this.currentRefreshToken = data.refresh_token;
    }

    return this.cachedToken;
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
    throw new Error("Missing required Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new Error("Authorization header must use Bearer scheme");
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
  const adAccountId =
    extractHeader(headers, "x-snapchat-advertiser-id") ??
    extractHeader(headers, "X-Snapchat-Advertiser-Id");

  if (!adAccountId) {
    throw new Error("Missing required X-Snapchat-Advertiser-Id header");
  }

  return adAccountId;
}

/**
 * Generate a fingerprint for a Snapchat access token + advertiser ID pair (for session binding).
 */
export function getSnapchatCredentialFingerprint(
  accessToken: string,
  adAccountId: string
): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${adAccountId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}
