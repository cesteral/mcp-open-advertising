/**
 * LinkedIn Auth Adapter
 *
 * Simple token holder for LinkedIn Marketing API access tokens.
 * LinkedIn access tokens are pre-generated via the LinkedIn Developer Portal.
 * No token exchange needed.
 *
 * Validates token by hitting GET /v2/me?projection=(id,vanityName) on the API.
 */

import { createHash } from "crypto";
import { fetchWithTimeout } from "@cesteral/shared";

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
      throw new Error(
        `LinkedIn token validation failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as { id: string; vanityName?: string };
    this._personId = data.id;
    this.validated = true;
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
    throw new Error("Missing required Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new Error("Authorization header must use Bearer scheme");
  }

  return match[1];
}

/**
 * Generate a fingerprint for a LinkedIn access token (for session binding).
 */
export function getLinkedInCredentialFingerprint(accessToken: string): string {
  return createHash("sha256")
    .update(accessToken.trim())
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
