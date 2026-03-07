/**
 * LinkedIn Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for LinkedIn Ads.
 * Supports two credential flows:
 * 1. Static Bearer token (Authorization header) — for pre-generated tokens
 * 2. Refresh token flow (X-LinkedIn-Client-Id/Secret/Refresh-Token headers) —
 *    auto-refreshes access tokens (recommended for production, 60-day token expiry)
 *
 * Falls back to static token if refresh credentials are not provided.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  LinkedInAccessTokenAdapter,
  LinkedInRefreshTokenAdapter,
  parseLinkedInTokenFromHeaders,
  parseLinkedInRefreshCredentialsFromHeaders,
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
    // Prefer refresh token flow if all credentials are present
    const refreshCreds = parseLinkedInRefreshCredentialsFromHeaders(headers);
    if (refreshCreds) {
      const adapter = new LinkedInRefreshTokenAdapter(
        refreshCreds,
        this.baseUrl,
        this.apiVersion
      );
      await adapter.validate();

      this.logger?.debug(
        { personId: adapter.personId, authFlow: "refresh-token" },
        "LinkedIn credentials validated (refresh token flow)"
      );

      // Fingerprint based on client ID (stable, not the rotating token)
      const fingerprint = getLinkedInCredentialFingerprint(refreshCreds.clientId);

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

    // Fallback: static Bearer token
    const token = parseLinkedInTokenFromHeaders(headers);
    const adapter = new LinkedInAccessTokenAdapter(token, this.baseUrl, this.apiVersion);

    await adapter.validate();

    this.logger?.debug(
      { personId: adapter.personId, authFlow: "static-token" },
      "LinkedIn credentials validated (static token)"
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
    const refreshCreds = parseLinkedInRefreshCredentialsFromHeaders(headers);
    if (refreshCreds) {
      return getLinkedInCredentialFingerprint(refreshCreds.clientId);
    }

    const token = parseLinkedInTokenFromHeaders(headers);
    return getLinkedInCredentialFingerprint(token);
  }
}
