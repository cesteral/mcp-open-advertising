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
 * Caching + single-flight refresh live in OAuth2RefreshAdapterBase; this
 * subclass owns the Google-specific exchange request and exposes the
 * developer-token / login-customer-id carrier fields.
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
 * Token exchange adapter that authenticates via Google's OAuth2 endpoint.
 * Caches tokens until they're within 60s of expiry.
 */
export class GAdsRefreshTokenAuthAdapter
  extends OAuth2RefreshAdapterBase<{ appId: string; appSecret: string; refreshToken: string }>
  implements GAdsAuthAdapter
{
  private static readonly TOKEN_URL = "https://oauth2.googleapis.com/token";
  private static readonly TOKEN_TIMEOUT_MS = 10_000;

  private readonly _developerToken: string;
  private readonly _loginCustomerId: string | undefined;

  constructor(credentials: GAdsCredentials) {
    super({
      platformName: "Google Ads",
      credentials: {
        appId: credentials.clientId,
        appSecret: credentials.clientSecret,
        refreshToken: credentials.refreshToken,
      },
      requestToken: async (refreshToken) => {
        const body = new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        });

        const response = await fetchWithTimeout(
          GAdsRefreshTokenAuthAdapter.TOKEN_URL,
          GAdsRefreshTokenAuthAdapter.TOKEN_TIMEOUT_MS,
          undefined,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          }
        );

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `Google OAuth2 token exchange failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
          );
        }

        return (await response.json()) as {
          access_token?: string;
          expires_in?: number;
          refresh_token?: string;
        };
      },
    });
    this._developerToken = credentials.developerToken;
    this._loginCustomerId = credentials.loginCustomerId;
  }

  get developerToken(): string {
    return this._developerToken;
  }

  get loginCustomerId(): string | undefined {
    return this._loginCustomerId;
  }

  async validate(): Promise<void> {
    await this.getAccessToken();
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
  return createHash("sha256").update(credentials.clientId).digest("hex").substring(0, 32);
}
