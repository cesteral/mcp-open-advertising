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

import { createHash } from "crypto";
import { fetchWithTimeout } from "@cesteral/shared";

/**
 * Contract for Meta authentication adapters.
 */
export interface MetaAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
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
    private readonly baseUrl: string = "https://graph.facebook.com/v21.0"
  ) {}

  get userId(): string {
    return this._userId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  /**
   * Validate the access token by calling GET /me.
   * Must be called before the adapter is used.
   */
  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}/me?fields=id,name`,
      10_000,
      undefined,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Meta token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as { id: string; name: string };
    this._userId = data.id;
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
 * Meta token exchange response shape.
 */
interface MetaTokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in?: number; // seconds — present for long-lived tokens (typically 5184000 = 60 days)
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
 * This adapter exchanges the initial token for a long-lived one and caches it.
 * If the long-lived token approaches expiry (within 24h), it exchanges it for
 * a new long-lived token. Uses same mutex pattern as TTD/TikTok adapters.
 */
export class MetaRefreshTokenAdapter implements MetaAuthAdapter {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingExchange: Promise<string> | null = null;
  private _userId = "";

  /**
   * 24h buffer is appropriate for Meta's 60-day long-lived tokens.
   * A shorter buffer (e.g., 60s as used for TikTok/LinkedIn's shorter-lived
   * tokens) would risk expiry between infrequent refresh checks.
   */
  private static readonly EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly initialToken: string,
    private readonly appCredentials: MetaAppCredentials,
    private readonly baseUrl: string = "https://graph.facebook.com/v21.0"
  ) {}

  get userId(): string {
    return this._userId;
  }

  async validate(): Promise<void> {
    const token = await this.getAccessToken();

    const response = await fetchWithTimeout(
      `${this.baseUrl}/me?fields=id,name`,
      10_000,
      undefined,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Meta token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as { id: string; name: string };
    this._userId = data.id;
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (this.pendingExchange) {
      return this.pendingExchange;
    }

    this.pendingExchange = this.exchangeForLongLivedToken();
    try {
      return await this.pendingExchange;
    } finally {
      this.pendingExchange = null;
    }
  }

  private async exchangeForLongLivedToken(): Promise<string> {
    // Use the current cached token if available (for refresh), otherwise the initial token
    const tokenToExchange = this.cachedToken ?? this.initialToken;

    // POST with form-encoded body keeps client_secret out of URLs
    // (URLs can leak through load balancer / CDN / proxy access logs)
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.appCredentials.appId,
      client_secret: this.appCredentials.appSecret,
      fb_exchange_token: tokenToExchange,
    });

    const response = await fetchWithTimeout(
      `${this.baseUrl}/oauth/access_token`,
      10_000,
      undefined,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${tokenToExchange}`,
        },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Meta token exchange failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as MetaTokenExchangeResponse;
    if (!data.access_token) {
      throw new Error("Meta token exchange returned no access_token");
    }

    this.cachedToken = data.access_token;

    if (data.expires_in) {
      this.tokenExpiresAt =
        Date.now() + data.expires_in * 1000 - MetaRefreshTokenAdapter.EXPIRY_BUFFER_MS;
    } else {
      // System User tokens have no expiry — cache indefinitely
      this.tokenExpiresAt = Number.MAX_SAFE_INTEGER;
    }

    return this.cachedToken;
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
  return createHash("sha256")
    .update(accessToken.trim())
    .digest("hex")
    .substring(0, 32);
}

function extractHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}
