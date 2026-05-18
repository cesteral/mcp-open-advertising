// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Auth Adapters
 *
 * Two adapter implementations:
 * 1. MetaAccessTokenAdapter — holds a pre-generated static access token.
 * 2. MetaRefreshTokenAdapter — uses app credentials to exchange a short-lived
 *    token for a long-lived token (60-day expiry) and caches it. Also supports
 *    refreshing long-lived tokens before they expire.
 *
 * Validates tokens by hitting GET /me?fields=id,name on the Graph API.
 * Tokens passed via Authorization: Bearer header (not query param).
 */

import {
  extractHeader,
  fetchWithTimeout,
  fingerprintCredentials,
  JsonRpcErrorCode,
  McpError,
  OAuth2RefreshAdapterBase,
} from "@cesteral/shared";

const DEFAULT_META_GRAPH_API_BASE_URL = "https://graph.facebook.com/v25.0";

/**
 * Contract for Meta authentication adapters.
 */
export interface MetaAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
}

/**
 * Validate a Meta access token against GET /me and return the authenticated
 * user's id. Throws Unauthorized on any non-2xx response.
 */
async function fetchMetaUserId(token: string, baseUrl: string): Promise<string> {
  const response = await fetchWithTimeout(`${baseUrl}/me?fields=id,name`, 10_000, undefined, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new McpError(
      JsonRpcErrorCode.Unauthorized,
      `Meta token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
    );
  }

  const data = (await response.json()) as { id: string; name: string };
  return data.id;
}

/**
 * Simple access token adapter — holds a pre-generated Meta access token.
 * Validates the token on first use by calling GET /me.
 */
export class MetaAccessTokenAdapter implements MetaAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly baseUrl: string = DEFAULT_META_GRAPH_API_BASE_URL
  ) {}

  get userId(): string {
    return this._userId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async validate(): Promise<void> {
    if (this.validated) return;
    this._userId = await fetchMetaUserId(this.accessToken, this.baseUrl);
    this.validated = true;
  }
}

/**
 * Meta app credentials for token exchange.
 */
export interface MetaAppCredentials {
  appId: string;
  appSecret: string;
}

/**
 * Refresh token adapter — uses app credentials to exchange short-lived tokens
 * for long-lived tokens and refresh them before expiry.
 *
 * Meta token lifecycle:
 * - Short-lived tokens: 1-2 hours (from client-side OAuth flow)
 * - Long-lived tokens: ~60 days (from server-side exchange)
 * - System User tokens: never expire (no refresh needed)
 *
 * Subsequent exchanges use the most recently obtained long-lived token (not
 * the initial token), which Meta's fb_exchange_token grant accepts as input.
 * That rotation is driven by returning the new access_token in the base's
 * `refresh_token` slot so OAuth2RefreshAdapterBase carries it forward.
 */
export class MetaRefreshTokenAdapter
  extends OAuth2RefreshAdapterBase<{ appId: string; appSecret: string; refreshToken: string }>
  implements MetaAuthAdapter
{
  private _userId = "";

  /**
   * 24h buffer is appropriate for Meta's 60-day long-lived tokens.
   * A shorter buffer (e.g., 60s as used for TikTok/LinkedIn's shorter-lived
   * tokens) would risk expiry between infrequent refresh checks.
   */
  private static readonly EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000;

  /** ~100 years — used when Meta returns no expires_in (system-user tokens). */
  private static readonly INDEFINITE_EXPIRES_IN_SECONDS = 100 * 365 * 24 * 60 * 60;

  constructor(
    initialToken: string,
    appCredentials: MetaAppCredentials,
    private readonly baseUrl: string = DEFAULT_META_GRAPH_API_BASE_URL
  ) {
    super({
      platformName: "Meta",
      credentials: {
        appId: appCredentials.appId,
        appSecret: appCredentials.appSecret,
        refreshToken: initialToken,
      },
      expiryBufferMs: MetaRefreshTokenAdapter.EXPIRY_BUFFER_MS,
      requestToken: async (tokenToExchange) => {
        // POST with form-encoded body keeps client_secret out of URLs
        // (URLs can leak through load balancer / CDN / proxy access logs)
        const params = new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appCredentials.appId,
          client_secret: appCredentials.appSecret,
          fb_exchange_token: tokenToExchange,
        });

        const response = await fetchWithTimeout(
          `${baseUrl}/oauth/access_token`,
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
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `Meta token exchange failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
          );
        }

        const data = (await response.json()) as {
          access_token?: string;
          token_type?: string;
          expires_in?: number;
        };

        if (!data.access_token) {
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            "Meta token exchange returned no access_token"
          );
        }

        // Meta's exchange returns the new long-lived token as `access_token`
        // with no `refresh_token`. Echo it into the refresh_token slot so the
        // base rotates `currentRefreshToken` and the next exchange uses the
        // freshest token instead of the (possibly expired) initial one.
        // System-user tokens lack expires_in — fall back to a multi-decade TTL.
        return {
          access_token: data.access_token,
          expires_in: data.expires_in ?? MetaRefreshTokenAdapter.INDEFINITE_EXPIRES_IN_SECONDS,
          refresh_token: data.access_token,
        };
      },
    });
  }

  get userId(): string {
    return this._userId;
  }

  async validate(): Promise<void> {
    const token = await this.getAccessToken();
    this._userId = await fetchMetaUserId(token, this.baseUrl);
  }
}

/**
 * Parse Meta access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseMetaTokenFromHeaders(
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
 * Parse Meta app credentials from HTTP headers.
 * Expects X-Meta-App-Id and X-Meta-App-Secret headers.
 */
export function parseMetaAppCredentialsFromHeaders(
  headers: Record<string, string | string[] | undefined>
): MetaAppCredentials | undefined {
  const appId = extractHeader(headers, "x-meta-app-id");
  const appSecret = extractHeader(headers, "x-meta-app-secret");

  if (!appId || !appSecret) {
    return undefined;
  }

  return { appId, appSecret };
}

/**
 * Generate a fingerprint for a Meta access token (for session binding).
 */
export function getMetaCredentialFingerprint(accessToken: string): string {
  return fingerprintCredentials(accessToken);
}
