/**
 * Meta Auth Adapter
 *
 * Simple token holder for Meta Marketing API access tokens.
 * Meta access tokens are pre-generated via Business Manager or Apps UI.
 * No token exchange needed (unlike TTD's OAuth2 client credentials flow).
 *
 * Validates token by hitting GET /me?fields=id,name on the Graph API.
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
      `${this.baseUrl}/me?fields=id,name&access_token=${this.accessToken}`,
      10_000,
      undefined,
      undefined,
      (u) => u.replace(/access_token=[^&]+/, "access_token=***")
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
 * Generate a fingerprint for a Meta access token (for session binding).
 */
export function getMetaCredentialFingerprint(accessToken: string): string {
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
