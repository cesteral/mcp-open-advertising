/**
 * TikTok Auth Adapter
 *
 * Simple token holder for TikTok Marketing API access tokens.
 * Validates the token by calling GET /open_api/v1.3/user/info/.
 * Token is passed via Authorization: Bearer <token> header.
 */

import { createHash } from "crypto";
import { fetchWithTimeout } from "@cesteral/shared";

/**
 * TikTok API response shape (success)
 */
interface TikTokUserInfoResponse {
  code: number;
  message: string;
  data?: {
    display_name?: string;
    email?: string;
  };
}

/**
 * Contract for TikTok authentication adapters.
 */
export interface TikTokAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly advertiserId: string;
}

/**
 * Simple access token adapter — holds a pre-generated TikTok access token.
 * Validates the token on first use by calling GET /open_api/v1.3/user/info/.
 */
export class TikTokAccessTokenAdapter implements TikTokAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _advertiserId: string,
    private readonly baseUrl: string = "https://business-api.tiktok.com"
  ) {}

  get userId(): string {
    return this._userId;
  }

  get advertiserId(): string {
    return this._advertiserId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  /**
   * Validate the access token by calling GET /open_api/v1.3/user/info/.
   * Must be called before the adapter is used.
   */
  async validate(): Promise<void> {
    if (this.validated) {
      return;
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}/open_api/v1.3/user/info/`,
      10_000,
      undefined,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `TikTok token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as TikTokUserInfoResponse;

    if (data.code !== 0) {
      throw new Error(
        `TikTok token validation failed: code=${data.code} message=${data.message}`
      );
    }

    this._userId = data.data?.display_name ?? data.data?.email ?? "unknown";
    this.validated = true;
  }
}

/**
 * Parse TikTok access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseTikTokTokenFromHeaders(
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
 * Extract TikTok advertiser ID from HTTP headers.
 * Expects `X-TikTok-Advertiser-Id: <id>` header.
 */
export function getTikTokAdvertiserIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const advertiserId =
    extractHeader(headers, "x-tiktok-advertiser-id") ??
    extractHeader(headers, "X-TikTok-Advertiser-Id");

  if (!advertiserId) {
    throw new Error("Missing required X-TikTok-Advertiser-Id header");
  }

  return advertiserId;
}

/**
 * Generate a fingerprint for a TikTok access token + advertiser ID pair (for session binding).
 */
export function getTikTokCredentialFingerprint(
  accessToken: string,
  advertiserId: string
): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${advertiserId.trim()}`)
    .digest("hex")
    .substring(0, 16);
}

function extractHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}
