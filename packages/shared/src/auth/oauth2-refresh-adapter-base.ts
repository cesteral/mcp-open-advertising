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
}

/**
 * OAuth2 refresh-token cache with single-flight refresh behavior.
 *
 * Platform adapters own validation and platform-specific header parsing; this
 * base owns the common "exchange refresh token for access token" lifecycle.
 */
export abstract class OAuth2RefreshAdapterBase<
  TCredentials extends OAuth2RefreshTokenCredentials,
> {
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
      Date.now() +
      (data.expires_in ?? 3600) * 1000 -
      (this.options.expiryBufferMs ?? 60_000);

    if (data.refresh_token) {
      this.currentRefreshToken = data.refresh_token;
    }

    return this.cachedToken;
  }
}
