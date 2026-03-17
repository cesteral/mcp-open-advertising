// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * AmazonDsp Auth Adapters
 *
 * Two adapter implementations:
 * 1. AmazonDspAccessTokenAdapter — holds a pre-generated static access token.
 * 2. AmazonDspRefreshTokenAdapter — uses app credentials + refresh token to
 *    auto-refresh access tokens via Amazon LwA endpoint. Same caching + mutex
 *    pattern as TTD's TtdApiTokenAuthAdapter.
 *
 * Validates tokens by calling GET /dsp/advertisers?startIndex=0&count=1.
 * Token refresh uses POST https://api.amazon.com/auth/o2/token (form-encoded).
 * Token is passed via Authorization: Bearer <token> header.
 */

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

/**
 * Amazon DSP advertiser list response shape (success)
 */
interface AmazonDspAdvertiserListResponse {
  advertisers: Array<{ advertiserId: string; name: string }>;
  totalResults: number;
}

/**
 * Contract for AmazonDsp authentication adapters.
 */
export interface AmazonDspAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly profileId: string;
  readonly clientId: string;
}

/**
 * Simple access token adapter — holds a pre-generated AmazonDsp access token.
 * Validates the token on first use by calling GET /dsp/advertisers.
 */
export class AmazonDspAccessTokenAdapter implements AmazonDspAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _profileId: string,
    private readonly baseUrl: string = "https://advertising-api.amazon.com",
    private readonly _clientId: string = ""
  ) {}

  get userId(): string {
    return this._userId;
  }

  get profileId(): string {
    return this._profileId;
  }

  get clientId(): string {
    return this._clientId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  /**
   * Validate the access token by calling GET /dsp/advertisers?startIndex=0&count=1.
   * Must be called before the adapter is used.
   */
  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}/dsp/advertisers?startIndex=0&count=1`,
      10_000,
      undefined,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...(this._clientId && { "Amazon-Advertising-API-ClientId": this._clientId }),
          "Amazon-Advertising-API-Scope": this._profileId,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `AmazonDsp token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as AmazonDspAdvertiserListResponse;
    this._userId = data.advertisers?.[0]?.name ?? "unknown";
    this.validated = true;
  }
}

/**
 * AmazonDsp OAuth2 refresh token credentials.
 */
export interface AmazonDspRefreshCredentials {
  appId: string;
  appSecret: string;
  refreshToken: string;
}

/**
 * Amazon LwA (Login with Amazon) OAuth2 token response shape — flat, no wrapper.
 */
interface AmazonDspTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Refresh token adapter — uses app credentials + refresh token to obtain
 * and auto-refresh access tokens via Amazon LwA OAuth2 endpoint.
 *
 * Amazon access tokens expire after 1 hour. This adapter caches them
 * with a 60-second expiry buffer and uses a mutex to prevent concurrent
 * token requests (same pattern as TTD's TtdApiTokenAuthAdapter).
 */
export class AmazonDspRefreshTokenAdapter implements AmazonDspAuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;
  private _userId = "";
  private currentRefreshToken: string;

  private static readonly EXPIRY_BUFFER_MS = 60_000;

  constructor(
    private readonly credentials: AmazonDspRefreshCredentials,
    private readonly _profileId: string,
    private readonly baseUrl: string = "https://advertising-api.amazon.com"
  ) {
    this.currentRefreshToken = credentials.refreshToken;
  }

  get userId(): string {
    return this._userId;
  }

  get profileId(): string {
    return this._profileId;
  }

  get clientId(): string {
    return this.credentials.appId;
  }

  async validate(): Promise<void> {
    // Force a token exchange to validate credentials
    const token = await this.getAccessToken();

    // Validate the token against the DSP advertisers endpoint
    const response = await fetchWithTimeout(
      `${this.baseUrl}/dsp/advertisers?startIndex=0&count=1`,
      10_000,
      undefined,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Amazon-Advertising-API-ClientId": this.credentials.appId,
          "Amazon-Advertising-API-Scope": this._profileId,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `AmazonDsp token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as AmazonDspAdvertiserListResponse;
    this._userId = data.advertisers?.[0]?.name ?? "unknown";
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

    // Amazon LwA token endpoint is always on api.amazon.com, not the DSP advertising API.
    const response = await fetchWithTimeout(
      "https://api.amazon.com/auth/o2/token",
      10_000,
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `AmazonDsp token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as AmazonDspTokenResponse;
    if (!data.access_token) {
      throw new Error(
        "AmazonDsp token refresh failed: missing access_token in response"
      );
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      Date.now() + data.expires_in * 1000 - AmazonDspRefreshTokenAdapter.EXPIRY_BUFFER_MS;

    // Amazon may rotate the refresh token — store the new one
    if (data.refresh_token) {
      this.currentRefreshToken = data.refresh_token;
    }

    return this.cachedToken;
  }
}

/**
 * Parse AmazonDsp refresh token credentials from HTTP headers.
 * Expects X-AmazonDsp-App-Id, X-AmazonDsp-App-Secret, X-AmazonDsp-Refresh-Token headers.
 */
export function parseAmazonDspRefreshCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): AmazonDspRefreshCredentials | undefined {
  const appId = extractHeader(headers, "x-amazondsp-app-id");
  const appSecret = extractHeader(headers, "x-amazondsp-app-secret");
  const refreshToken = extractHeader(headers, "x-amazondsp-refresh-token");

  if (!appId || !appSecret || !refreshToken) {
    return undefined;
  }

  return { appId, appSecret, refreshToken };
}

/**
 * Parse AmazonDsp access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseAmazonDspTokenFromHeaders(
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
 * Extract Amazon DSP profile ID from HTTP headers.
 * Expects `Amazon-Advertising-API-Scope: <profileId>` header (real Amazon DSP header).
 */
export function getAmazonDspProfileIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const profileId =
    extractHeader(headers, "amazon-advertising-api-scope") ??
    extractHeader(headers, "Amazon-Advertising-API-Scope");

  if (!profileId) {
    throw new Error(
      "Missing required Amazon-Advertising-API-Scope header (DSP entity ID / profile ID). " +
      "Also ensure Amazon-Advertising-API-ClientId header is set."
    );
  }

  return profileId;
}

/**
 * Generate a fingerprint for a AmazonDsp access token + advertiser ID pair (for session binding).
 */
export function getAmazonDspCredentialFingerprint(
  accessToken: string,
  profileId: string
): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${profileId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}