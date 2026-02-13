/**
 * TTD Headers Auth Strategy
 *
 * Implements the shared AuthStrategy interface for The Trade Desk.
 * Parses X-TTD-Partner-Id and X-TTD-Api-Secret from HTTP headers,
 * creates a TtdApiTokenAuthAdapter, and validates by exchanging for a token.
 */

import type { AuthStrategy, AuthResult } from "@bidshifter/shared";
import type { Logger } from "pino";
import {
  TtdApiTokenAuthAdapter,
  parseTtdCredentialsFromHeaders,
  getTtdCredentialFingerprint,
} from "./ttd-auth-adapter.js";

export class TtdHeadersAuthStrategy implements AuthStrategy {
  constructor(
    private readonly authUrl: string,
    private readonly logger?: Logger
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const credentials = parseTtdCredentialsFromHeaders(headers);
    const adapter = new TtdApiTokenAuthAdapter(credentials, this.authUrl);

    // Validate by attempting to get an access token
    await adapter.getAccessToken();

    this.logger?.debug(
      { partnerId: credentials.partnerId },
      "TTD credentials validated"
    );

    const fingerprint = getTtdCredentialFingerprint(credentials);

    return {
      authInfo: {
        clientId: credentials.partnerId,
        authType: "ttd-headers",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }
}
