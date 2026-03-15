// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

/**
 * Contract for Microsoft Advertising authentication adapters.
 * Microsoft Ads requires 4 credentials per request:
 * - AuthenticationToken (OAuth2 access token)
 * - DeveloperToken (per-app, not per-user)
 * - CustomerId (manager account ID)
 * - CustomerAccountId (ad account ID)
 */
export interface MsAdsAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly developerToken: string;
  readonly customerId: string;
  readonly accountId: string;
  readonly userId: string;
}

interface GetUserResponse {
  UserId?: number;
  UserName?: string;
}

/**
 * Simple access token adapter — holds a pre-generated Microsoft Ads OAuth2 token
 * plus developer token and account identifiers.
 * Validates via Customer Management API GetUser call.
 */
export class MsAdsAccessTokenAdapter implements MsAdsAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _developerToken: string,
    private readonly _customerId: string,
    private readonly _accountId: string,
    private readonly customerApiBaseUrl: string = "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13"
  ) {}

  get developerToken(): string {
    return this._developerToken;
  }

  get customerId(): string {
    return this._customerId;
  }

  get accountId(): string {
    return this._accountId;
  }

  get userId(): string {
    return this._userId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async validate(): Promise<void> {
    if (this.validated) return;

    const response = await fetchWithTimeout(
      `${this.customerApiBaseUrl}/User/GetUser`,
      10_000,
      undefined,
      {
        method: "POST",
        headers: {
          AuthenticationToken: this.accessToken,
          DeveloperToken: this._developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ UserId: null }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Microsoft Ads token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as GetUserResponse;
    this._userId = String(data.UserId ?? "unknown");
    this.validated = true;
  }
}

/**
 * Parse Microsoft Ads access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseMsAdsTokenFromHeaders(
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
 * Extract Microsoft Ads developer token from HTTP headers.
 */
export function getMsAdsDeveloperTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const token = extractHeader(headers, "x-msads-developer-token");
  if (!token) {
    throw new Error("Missing required X-MSAds-Developer-Token header");
  }
  return token;
}

/**
 * Extract Microsoft Ads customer ID from HTTP headers.
 */
export function getMsAdsCustomerIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const id = extractHeader(headers, "x-msads-customer-id");
  if (!id) {
    throw new Error("Missing required X-MSAds-Customer-Id header");
  }
  return id;
}

/**
 * Extract Microsoft Ads account ID from HTTP headers.
 */
export function getMsAdsAccountIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const id = extractHeader(headers, "x-msads-account-id");
  if (!id) {
    throw new Error("Missing required X-MSAds-Account-Id header");
  }
  return id;
}

/**
 * Generate a fingerprint for session binding.
 */
export function getMsAdsCredentialFingerprint(
  accessToken: string,
  developerToken: string,
  accountId: string
): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${developerToken.trim()}:${accountId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}