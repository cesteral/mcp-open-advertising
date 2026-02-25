/**
 * Meta Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for Meta Ads.
 * Parses Bearer token from Authorization header,
 * creates a MetaAccessTokenAdapter, and validates by calling GET /me.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  MetaAccessTokenAdapter,
  parseMetaTokenFromHeaders,
  getMetaCredentialFingerprint,
} from "./meta-auth-adapter.js";

export class MetaBearerAuthStrategy implements AuthStrategy {
  constructor(
    private readonly baseUrl: string,
    private readonly logger?: Logger
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const token = parseMetaTokenFromHeaders(headers);
    const adapter = new MetaAccessTokenAdapter(token, this.baseUrl);

    // Validate by calling GET /me
    await adapter.validate();

    this.logger?.debug(
      { userId: adapter.userId },
      "Meta credentials validated"
    );

    const fingerprint = getMetaCredentialFingerprint(token);

    return {
      authInfo: {
        clientId: adapter.userId,
        subject: adapter.userId,
        authType: "meta-bearer",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    const token = parseMetaTokenFromHeaders(headers);
    return getMetaCredentialFingerprint(token);
  }
}
