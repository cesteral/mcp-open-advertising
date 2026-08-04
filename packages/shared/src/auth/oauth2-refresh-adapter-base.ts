// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "../utils/index.js";

export interface OAuth2RefreshTokenCredentials {
  appId: string;
  appSecret: string;
  refreshToken: string;
}

export interface OAuth2TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

export interface OAuth2RefreshAdapterOptions<TCredentials extends OAuth2RefreshTokenCredentials> {
  platformName: string;
  credentials: TCredentials;
  expiryBufferMs?: number;
  requestToken: (refreshToken: string) => Promise<OAuth2TokenResponse>;
  /**
   * Called when the token endpoint returns a rotated `refresh_token`. The base
   * keeps using the new value in-process, but that copy dies with the process —
   * deployments that need the rotation to survive a restart (e.g. persisting to
   * Secret Manager) must do it here. Errors are swallowed: failing to persist
   * must not fail the refresh that succeeded.
   */
  onRefreshTokenRotated?: (newRefreshToken: string) => void | Promise<void>;
}

/**
 * OAuth2 token-endpoint error codes (RFC 6749 §5.2) that mean the grant itself
 * is dead — expired, revoked, or the client is no longer authorized. Retrying
 * cannot help; the resource owner must re-authorize.
 */
const TERMINAL_OAUTH2_ERROR_CODES = ["invalid_grant", "invalid_client", "unauthorized_client"];

/**
 * Classify a non-2xx response from an OAuth2 token endpoint into the right
 * McpError. Terminal grant failures (see TERMINAL_OAUTH2_ERROR_CODES) become
 * `Unauthorized` so transports surface them as HTTP 401 with an auth hint;
 * everything else (throttling, 5xx) stays `InternalError`.
 *
 * Amazon LwA in particular returns HTTP 400 `{"error":"invalid_grant"}` once a
 * refresh token passes its 365-day lifetime (consent granted after 2026-07-30),
 * so without this split a permanent, operator-actionable failure is
 * indistinguishable from a transient endpoint blip.
 */
export function classifyOAuth2RefreshFailure(
  platformName: string,
  status: number,
  statusText: string,
  bodyText: string
): McpError {
  let oauthErrorCode: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as { error?: unknown };
    if (typeof parsed.error === "string") {
      oauthErrorCode = parsed.error;
    }
  } catch {
    // Non-JSON body — fall through to the generic classification.
  }

  if (oauthErrorCode && TERMINAL_OAUTH2_ERROR_CODES.includes(oauthErrorCode)) {
    return new McpError(
      JsonRpcErrorCode.Unauthorized,
      `${platformName} token refresh rejected (${oauthErrorCode}): the refresh token is expired or revoked. ` +
        `Re-authorization by the account owner is required to obtain a new refresh token.`
    );
  }

  return new McpError(
    JsonRpcErrorCode.InternalError,
    `${platformName} token refresh failed: ${status} ${statusText}. ${bodyText.substring(0, 200)}`
  );
}

/**
 * OAuth2 refresh-token cache with single-flight refresh behavior.
 *
 * Platform adapters own validation and platform-specific header parsing; this
 * base owns the common "exchange refresh token for access token" lifecycle.
 */
export abstract class OAuth2RefreshAdapterBase<TCredentials extends OAuth2RefreshTokenCredentials> {
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private pendingAuth: Promise<string> | null = null;
  private currentRefreshToken: string;

  protected readonly credentials: TCredentials;

  protected constructor(private readonly options: OAuth2RefreshAdapterOptions<TCredentials>) {
    this.credentials = options.credentials;
    this.currentRefreshToken = options.credentials.refreshToken;
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
    const data = await this.options.requestToken(this.currentRefreshToken);
    if (!data.access_token) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        `${this.options.platformName} token refresh failed: missing access_token in response`
      );
    }

    this.cachedToken = data.access_token;
    this.tokenExpiresAt =
      Date.now() + (data.expires_in ?? 3600) * 1000 - (this.options.expiryBufferMs ?? 60_000);

    if (data.refresh_token && data.refresh_token !== this.currentRefreshToken) {
      this.currentRefreshToken = data.refresh_token;
      if (this.options.onRefreshTokenRotated) {
        try {
          void Promise.resolve(this.options.onRefreshTokenRotated(data.refresh_token)).catch(
            () => {}
          );
        } catch {
          // Persisting the rotation is best-effort; the refresh itself succeeded.
        }
      }
    }

    return this.cachedToken;
  }
}
