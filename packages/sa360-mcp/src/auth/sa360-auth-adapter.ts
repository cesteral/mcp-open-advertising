// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Search Ads 360 Auth Adapter
 *
 * Handles authentication with the SA360 API.
 * Uses OAuth2 refresh token flow to obtain access tokens.
 * Token endpoint: https://oauth2.googleapis.com/token
 *
 * SA360 API requires only OAuth2 credentials (no developer token needed).
 * Scope: https://www.googleapis.com/auth/doubleclicksearch
 */

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

/**
 * SA360 credentials parsed from HTTP headers or environment variables.
 */
export interface SA360Credentials {
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** OAuth2 refresh token */
  refreshToken: string;
  /** Login customer ID for manager account access (optional, no dashes) */
  loginCustomerId?: string;
}

/**
 * Contract for SA360 authentication adapters.
 */
export interface SA360AuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
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
export class SA360RefreshTokenAuthAdapter implements SA360AuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;

  private static readonly EXPIRY_BUFFER_MS = 60_000;
  private static readonly TOKEN_URL = "https://oauth2.googleapis.com/token";
  private static readonly TOKEN_TIMEOUT_MS = 10_000;

  constructor(private readonly credentials: SA360Credentials) {}

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
      SA360RefreshTokenAuthAdapter.TOKEN_URL,
      SA360RefreshTokenAuthAdapter.TOKEN_TIMEOUT_MS,
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
      Date.now() + data.expires_in * 1000 - SA360RefreshTokenAuthAdapter.EXPIRY_BUFFER_MS;

    return this.cachedToken;
  }
}

/**
 * Parse SA360 credentials from HTTP headers.
 * Expects:
 *   X-SA360-Client-Id
 *   X-SA360-Client-Secret
 *   X-SA360-Refresh-Token
 *   X-SA360-Login-Customer-Id (optional)
 */
export function parseSA360CredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): SA360Credentials {
  const clientId = extractHeader(headers, "x-sa360-client-id");
  const clientSecret = extractHeader(headers, "x-sa360-client-secret");
  const refreshToken = extractHeader(headers, "x-sa360-refresh-token");
  const loginCustomerId = extractHeader(headers, "x-sa360-login-customer-id");

  if (!clientId) {
    throw new Error("Missing required header: X-SA360-Client-Id");
  }

  if (!clientSecret) {
    throw new Error("Missing required header: X-SA360-Client-Secret");
  }

  if (!refreshToken) {
    throw new Error("Missing required header: X-SA360-Refresh-Token");
  }

  return { clientId, clientSecret, refreshToken, loginCustomerId };
}

/**
 * Generate a fingerprint for SA360 credentials (for session binding).
 */
export function getSA360CredentialFingerprint(credentials: SA360Credentials): string {
  return createHash("sha256").update(credentials.clientId).digest("hex").substring(0, 32);
}
