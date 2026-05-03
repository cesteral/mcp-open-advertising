// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn Auth Adapters
 *
 * Two adapter implementations:
 * 1. LinkedInAccessTokenAdapter — holds a pre-generated static access token.
 * 2. LinkedInRefreshTokenAdapter — uses client credentials + refresh token to
 *    auto-refresh access tokens (60-day expiry). Same caching + mutex pattern
 *    as TTD's TtdCredentialExchangeAuthAdapter.
 *
 * Validates tokens by hitting GET /v2/me?projection=(id,vanityName) on the API.
 */

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout , McpError, JsonRpcErrorCode} from "@cesteral/shared";

/**
 * Contract for LinkedIn authentication adapters.
 */
export interface LinkedInAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly personId: string;
}

/**
 * Simple access token adapter — holds a pre-generated LinkedIn access token.
 * Validates the token on first use by calling GET /v2/me.
 */
export class LinkedInAccessTokenAdapter implements LinkedInAuthAdapter {
  private validated = false;
  private _personId = "";

  constructor(
    private readonly accessToken: string,
    private readonly baseUrl: string = "https://api.linkedin.com",
    private readonly apiVersion: string = "202409"
  ) {}

  get personId(): string {
    return this._personId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  /**
   * Validate the access token by calling GET /v2/me.
   * Must be called before the adapter is used.
   */
  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}/v2/me?projection=(id,vanityName)`,
      10_000,
      undefined,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "LinkedIn-Version": this.apiVersion,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
      undefined
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(JsonRpcErrorCode.Unauthorized, `LinkedIn token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as { id: string; vanityName?: string };
    this._personId = data.id;
    this.validated = true;
  }
}

/**
 * LinkedIn OAuth2 refresh token credentials.
 */
export interface LinkedInRefreshCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * LinkedIn OAuth2 token response shape.
 */
interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number; // seconds (typically 5184000 = 60 days)
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

/**
 * Refresh token adapter — uses client credentials + refresh token to obtain
 * and auto-refresh access tokens via LinkedIn's OAuth2 endpoint.
 *
 * LinkedIn access tokens expire after 60 days. This adapter caches them
 * with a 60-second expiry buffer and uses a mutex to prevent concurrent
 * token requests (same pattern as TTD's TtdCredentialExchangeAuthAdapter).
 */
export class LinkedInRefreshTokenAdapter implements LinkedInAuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;
  private _personId = "";
  private currentRefreshToken: string;

  private static readonly EXPIRY_BUFFER_MS = 60_000;

  constructor(
    private readonly credentials: LinkedInRefreshCredentials,
    private readonly baseUrl: string = "https://api.linkedin.com",
    private readonly apiVersion: string = "202409"
  ) {
    this.currentRefreshToken = credentials.refreshToken;
  }

  get personId(): string {
    return this._personId;
  }

  async validate(): Promise<void> {
    const token = await this.getAccessToken();

    const response = await fetchWithTimeout(
      `${this.baseUrl}/v2/me?projection=(id,vanityName)`,
      10_000,
      undefined,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": this.apiVersion,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
      undefined
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(JsonRpcErrorCode.InternalError, `LinkedIn token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
    }

    const data = (await response.json()) as { id: string; vanityName?: string };
    this._personId = data.id;
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
    // LinkedIn uses form-encoded POST to the www subdomain for OAuth2
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.currentRefreshToken,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
    });

    const response = await fetchWithTimeout(
      "https://www.linkedin.com/oauth/v2/accessToken",
      10_000,
      undefined,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new McpError(JsonRpcErrorCode.InternalError, `LinkedIn token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
    }

    const data = (await response.json()) as LinkedInTokenResponse;
    if (!data.access_token) {
      throw new McpError(JsonRpcErrorCode.InternalError, "LinkedIn token refresh returned no access_token");
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      Date.now() + data.expires_in * 1000 - LinkedInRefreshTokenAdapter.EXPIRY_BUFFER_MS;

    // LinkedIn may issue a new refresh token
    if (data.refresh_token) {
      this.currentRefreshToken = data.refresh_token;
    }

    return this.cachedToken;
  }
}

/**
 * Parse LinkedIn access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseLinkedInTokenFromHeaders(
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
 * Parse LinkedIn refresh token credentials from HTTP headers.
 * Expects X-LinkedIn-Client-Id, X-LinkedIn-Client-Secret, X-LinkedIn-Refresh-Token headers.
 */
export function parseLinkedInRefreshCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): LinkedInRefreshCredentials | undefined {
  const clientId = extractHeader(headers, "x-linkedin-client-id");
  const clientSecret = extractHeader(headers, "x-linkedin-client-secret");
  const refreshToken = extractHeader(headers, "x-linkedin-refresh-token");

  if (!clientId || !clientSecret || !refreshToken) {
    return undefined;
  }

  return { clientId, clientSecret, refreshToken };
}

/**
 * Generate a fingerprint for a LinkedIn access token (for session binding).
 */
export function getLinkedInCredentialFingerprint(accessToken: string): string {
  return createHash("sha256").update(accessToken.trim()).digest("hex").substring(0, 32);
}
