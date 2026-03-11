/**
 * SA360 Headers Auth Strategy
 *
 * Implements the shared AuthStrategy interface for Search Ads 360.
 * Parses OAuth2 credentials from HTTP headers,
 * creates a SA360RefreshTokenAuthAdapter, and validates by exchanging for a token.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  SA360RefreshTokenAuthAdapter,
  parseSA360CredentialsFromHeaders,
  getSA360CredentialFingerprint,
} from "./sa360-auth-adapter.js";

export class SA360HeadersAuthStrategy implements AuthStrategy {
  constructor(
    private readonly logger?: Logger
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const credentials = parseSA360CredentialsFromHeaders(headers);
    const adapter = new SA360RefreshTokenAuthAdapter(credentials);

    // Validate by attempting to get an access token
    await adapter.getAccessToken();

    this.logger?.debug(
      { clientId: credentials.clientId },
      "SA360 credentials validated"
    );

    const fingerprint = getSA360CredentialFingerprint(credentials);

    return {
      authInfo: {
        clientId: credentials.clientId,
        authType: "sa360-headers",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    const credentials = parseSA360CredentialsFromHeaders(headers);
    return getSA360CredentialFingerprint(credentials);
  }
}
