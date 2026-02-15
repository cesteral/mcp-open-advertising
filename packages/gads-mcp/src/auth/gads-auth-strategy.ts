/**
 * Google Ads Headers Auth Strategy
 *
 * Implements the shared AuthStrategy interface for Google Ads.
 * Parses OAuth2 + developer token credentials from HTTP headers,
 * creates a GAdsRefreshTokenAuthAdapter, and validates by exchanging for a token.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  GAdsRefreshTokenAuthAdapter,
  parseGAdsCredentialsFromHeaders,
  getGAdsCredentialFingerprint,
} from "./gads-auth-adapter.js";

export class GAdsHeadersAuthStrategy implements AuthStrategy {
  constructor(
    private readonly logger?: Logger
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const credentials = parseGAdsCredentialsFromHeaders(headers);
    const adapter = new GAdsRefreshTokenAuthAdapter(credentials);

    // Validate by attempting to get an access token
    await adapter.getAccessToken();

    this.logger?.debug(
      { clientId: credentials.clientId },
      "Google Ads credentials validated"
    );

    const fingerprint = getGAdsCredentialFingerprint(credentials);

    return {
      authInfo: {
        clientId: credentials.clientId,
        authType: "gads-headers",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }
}
