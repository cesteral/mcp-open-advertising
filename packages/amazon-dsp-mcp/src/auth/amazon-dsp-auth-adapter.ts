// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * AmazonDsp Auth Adapters
 *
 * Two adapter implementations:
 * 1. AmazonDspAccessTokenAdapter — holds a pre-generated static access token.
 * 2. AmazonDspRefreshTokenAdapter — uses app credentials + refresh token to
 *    auto-refresh access tokens via Amazon LwA endpoint. Same caching + mutex
 *    pattern as TTD's TtdCredentialExchangeAuthAdapter.
 *
 * Validates tokens by calling GET /dsp/advertisers?startIndex=0&count=1.
 * Token refresh uses POST https://api.amazon.com/auth/o2/token (form-encoded).
 * Token is passed via Authorization: Bearer <token> header.
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
      throw new McpError(JsonRpcErrorCode.Unauthorized, `AmazonDsp token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
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
 * Refresh token adapter — uses app credentials + refresh token to obtain
 * and auto-refresh access tokens via Amazon LwA OAuth2 endpoint.
 */
export class AmazonDspRefreshTokenAdapter
  extends OAuth2RefreshAdapterBase<AmazonDspRefreshCredentials>
  implements AmazonDspAuthAdapter
{
  private _userId = "";

  constructor(
    credentials: AmazonDspRefreshCredentials,
    private readonly _profileId: string,
    private readonly baseUrl: string = "https://advertising-api.amazon.com"
  ) {
    super({
      platformName: "AmazonDsp",
      credentials,
      requestToken: async (refreshToken) => {
        const response = await fetchWithTimeout(
          "https://api.amazon.com/auth/o2/token",
          10_000,
          undefined,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              client_id: credentials.appId,
              client_secret: credentials.appSecret,
              refresh_token: refreshToken,
            }).toString(),
          }
        );
        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          throw new McpError(
            JsonRpcErrorCode.InternalError,
            `AmazonDsp token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
          );
        }
        return (await response.json()) as {
          access_token?: string;
          expires_in?: number;
          refresh_token?: string;
        };
      },
    });
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
      throw new McpError(JsonRpcErrorCode.InternalError, `AmazonDsp token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
    }

    const data = (await response.json()) as AmazonDspAdvertiserListResponse;
    this._userId = data.advertisers?.[0]?.name ?? "unknown";
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
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Missing required Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "Authorization header must use Bearer scheme");
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
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      "Missing required Amazon-Advertising-API-Scope header (DSP entity ID / profile ID). " +
        "Also ensure Amazon-Advertising-API-ClientId header is set."
    );
  }

  return profileId;
}

/**
 * Generate a fingerprint for a AmazonDsp access token + advertiser ID pair (for session binding).
 */
export function getAmazonDspCredentialFingerprint(accessToken: string, profileId: string): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${profileId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}
