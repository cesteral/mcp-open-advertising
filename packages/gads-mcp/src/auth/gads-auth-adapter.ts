// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads Auth Adapter
 *
 * Handles authentication with the Google Ads API v23.
 * Uses OAuth2 refresh token flow to obtain access tokens.
 * Token endpoint: https://oauth2.googleapis.com/token
 *
 * Google Ads API requires three credentials per request:
 *  1. OAuth2 access token (via refresh token exchange)
 *  2. Developer token (static 22-char string, per company)
 *  3. Login customer ID (optional, for manager account access)
 *
 * Same caching pattern as TtdCredentialExchangeAuthAdapter: tokens are cached with a 60s
 * expiry buffer, and a pending-auth mutex prevents concurrent token requests.
 */

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

/**
 * Google Ads credentials parsed from HTTP headers or environment variables.
 */
export interface GAdsCredentials {
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** OAuth2 refresh token */
  refreshToken: string;
  /** Google Ads developer token (required for all API calls) */
  developerToken: string;
  /** Login customer ID for manager account access (optional, no dashes) */
  loginCustomerId?: string;
}

/**
 * Contract for Google Ads authentication adapters.
 */
export interface GAdsAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly developerToken: string;
  readonly loginCustomerId: string | undefined;
}

/**
 * Google OAuth2 token response shape.
 */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Token exchange adapter that authenticates via Google's OAuth2 endpoint.
 * Caches tokens until they're within 60s of expiry.
 */
export class GAdsRefreshTokenAuthAdapter implements GAdsAuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;

  private static readonly EXPIRY_BUFFER_MS = 60_000;
  private static readonly TOKEN_URL = "https://oauth2.googleapis.com/token";
  private static readonly TOKEN_TIMEOUT_MS = 10_000;

  constructor(private readonly credentials: GAdsCredentials) {}

  get developerToken(): string {
    return this.credentials.developerToken;
  }

  get loginCustomerId(): string | undefined {
    return this.credentials.loginCustomerId;
  }

  async validate(): Promise<void> {
    await this.getAccessToken();
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    // Mutex: if a token request is already in flight, wait for it
    if (this.pendingAuth) {
      return this.pendingAuth;
    }

    this.pendingAuth = this.exchangeToken();
    try {
      const token = await this.pendingAuth;
      return token;
    } finally {
      this.pendingAuth = null;
    }
  }

  private async exchangeToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: this.credentials.refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetchWithTimeout(
      GAdsRefreshTokenAuthAdapter.TOKEN_URL,
      GAdsRefreshTokenAuthAdapter.TOKEN_TIMEOUT_MS,
      undefined,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Google OAuth2 token exchange failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as TokenResponse;

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      Date.now() + data.expires_in * 1000 - GAdsRefreshTokenAuthAdapter.EXPIRY_BUFFER_MS;

    return this.cachedToken;
  }
}

/**
 * Parse Google Ads credentials from HTTP headers.
 * Expects:
 *   X-GAds-Developer-Token
 *   X-GAds-Client-Id
 *   X-GAds-Client-Secret
 *   X-GAds-Refresh-Token
 *   X-GAds-Login-Customer-Id (optional)
 */
export function parseGAdsCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): GAdsCredentials {
  const developerToken = extractHeader(headers, "x-gads-developer-token");
  const clientId = extractHeader(headers, "x-gads-client-id");
  const clientSecret = extractHeader(headers, "x-gads-client-secret");
  const refreshToken = extractHeader(headers, "x-gads-refresh-token");
  const loginCustomerId = extractHeader(headers, "x-gads-login-customer-id");

  if (!developerToken) {
    throw new Error("Missing required header: X-GAds-Developer-Token");
  }

  if (!clientId) {
    throw new Error("Missing required header: X-GAds-Client-Id");
  }

  if (!clientSecret) {
    throw new Error("Missing required header: X-GAds-Client-Secret");
  }

  if (!refreshToken) {
    throw new Error("Missing required header: X-GAds-Refresh-Token");
  }

  return { developerToken, clientId, clientSecret, refreshToken, loginCustomerId };
}

/**
 * Generate a fingerprint for Google Ads credentials (for session binding).
 */
export function getGAdsCredentialFingerprint(credentials: GAdsCredentials): string {
  return createHash("sha256")
    .update(credentials.clientId)
    .digest("hex")
    .substring(0, 32);
}