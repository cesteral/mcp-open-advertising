// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Auth Adapter
 *
 * Handles authentication with The Trade Desk API v3.
 * Uses partner ID + API secret to obtain access tokens via POST /v3/authentication.
 * Token endpoint: https://api.thetradedesk.com/v3/authentication
 *
 * Same caching pattern as GoogleAuthAdapter: tokens are cached with a 60s
 * expiry buffer, and a pending-auth mutex prevents concurrent token requests.
 */

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

/**
 * TTD credentials parsed from HTTP headers or environment variables.
 */
export interface TtdCredentials {
  partnerId: string;
  apiSecret: string;
}

/**
 * Contract for TTD authentication adapters.
 */
export interface TtdAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly partnerId: string;
}

/**
 * TTD API token response shape.
 */
interface TokenResponse {
  Token: string;
  ExpirationDateUTCString: string;
}

/**
 * Token exchange adapter that authenticates with TTD's OAuth2 endpoint.
 * Caches tokens until they're within 60s of expiry.
 */
export class TtdApiTokenAuthAdapter implements TtdAuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;

  private static readonly EXPIRY_BUFFER_MS = 60_000;

  constructor(
    private readonly credentials: TtdCredentials,
    private readonly authUrl: string = "https://api.thetradedesk.com/v3/authentication"
  ) {}

  get partnerId(): string {
    return this.credentials.partnerId;
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
    const response = await fetchWithTimeout(this.authUrl, 10_000, undefined, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Login: this.credentials.partnerId,
        Password: this.credentials.apiSecret,
        TokenType: "Bearer",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `TTD token exchange failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as TokenResponse;

    this.cachedToken = data.Token;
    const expiresAt = Date.parse(data.ExpirationDateUTCString);
    this.tokenExpiresAt = (!isNaN(expiresAt) ? expiresAt : Date.now() + 3_600_000)
      - TtdApiTokenAuthAdapter.EXPIRY_BUFFER_MS;

    return this.cachedToken;
  }
}

/**
 * Direct token adapter — accepts a pre-existing TTD bearer token and returns
 * it as-is without performing a token exchange. Use when you already have a
 * valid TTD-Auth token (e.g. set via TTD_API_TOKEN env var).
 */
export class TtdDirectTokenAuthAdapter implements TtdAuthAdapter {
  constructor(
    private readonly token: string,
    private readonly _partnerId: string = "direct-token"
  ) {}

  get partnerId(): string {
    return this._partnerId;
  }

  async getAccessToken(): Promise<string> {
    return this.token;
  }

  async validate(): Promise<void> {
    // Token is provided directly — no exchange needed.
  }
}

/**
 * Parse TTD credentials from HTTP headers.
 * Expects X-TTD-Partner-Id and X-TTD-Api-Secret headers.
 */
export function parseTtdCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): TtdCredentials {
  const partnerId = extractHeader(headers, "x-ttd-partner-id");
  const apiSecret = extractHeader(headers, "x-ttd-api-secret");

  if (!partnerId) {
    throw new Error("Missing required header: X-TTD-Partner-Id");
  }

  if (!apiSecret) {
    throw new Error("Missing required header: X-TTD-Api-Secret");
  }

  return { partnerId, apiSecret };
}

/**
 * Generate a fingerprint for TTD credentials (for session binding).
 */
export function getTtdCredentialFingerprint(credentials: TtdCredentials): string {
  return createHash("sha256")
    .update(`${credentials.partnerId}:${credentials.apiSecret}`)
    .digest("hex")
    .substring(0, 32);
}