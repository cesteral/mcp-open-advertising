/**
 * LinkedIn Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for LinkedIn Ads.
 * Parses Bearer token from Authorization header,
 * creates a LinkedInAccessTokenAdapter, and validates by calling GET /v2/me.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  LinkedInAccessTokenAdapter,
  parseLinkedInTokenFromHeaders,
  getLinkedInCredentialFingerprint,
} from "./linkedin-auth-adapter.js";

export class LinkedInBearerAuthStrategy implements AuthStrategy {
  constructor(
    private readonly baseUrl: string,
    private readonly apiVersion: string,
    private readonly logger?: Logger
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const token = parseLinkedInTokenFromHeaders(headers);
    const adapter = new LinkedInAccessTokenAdapter(token, this.baseUrl, this.apiVersion);

    // Validate by calling GET /v2/me
    await adapter.validate();

    this.logger?.debug(
      { personId: adapter.personId },
      "LinkedIn credentials validated"
    );

    const fingerprint = getLinkedInCredentialFingerprint(token);

    return {
      authInfo: {
        clientId: adapter.personId,
        subject: adapter.personId,
        authType: "linkedin-bearer",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    const token = parseLinkedInTokenFromHeaders(headers);
    return getLinkedInCredentialFingerprint(token);
  }
}
