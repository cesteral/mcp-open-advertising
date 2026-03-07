/**
 * Meta Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for Meta Ads.
 * Supports two credential flows:
 * 1. Static Bearer token (Authorization header) — for pre-generated tokens
 * 2. Token exchange flow (Authorization + X-Meta-App-Id/Secret headers) —
 *    exchanges short-lived tokens for long-lived ones and auto-refreshes
 *    (recommended for production, 60-day long-lived token expiry)
 *
 * Falls back to static token if app credentials are not provided.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  MetaAccessTokenAdapter,
  MetaRefreshTokenAdapter,
  parseMetaTokenFromHeaders,
  parseMetaAppCredentialsFromHeaders,
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

    // Prefer token exchange flow if app credentials are present
    const appCreds = parseMetaAppCredentialsFromHeaders(headers);
    if (appCreds) {
      const adapter = new MetaRefreshTokenAdapter(token, appCreds, this.baseUrl);
      await adapter.validate();

      this.logger?.debug(
        { userId: adapter.userId, authFlow: "token-exchange" },
        "Meta credentials validated (token exchange flow)"
      );

      // Fingerprint based on app ID (stable, not the rotating token)
      const fingerprint = getMetaCredentialFingerprint(appCreds.appId);

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

    // Fallback: static Bearer token
    const adapter = new MetaAccessTokenAdapter(token, this.baseUrl);
    await adapter.validate();

    this.logger?.debug(
      { userId: adapter.userId, authFlow: "static-token" },
      "Meta credentials validated (static token)"
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
    const appCreds = parseMetaAppCredentialsFromHeaders(headers);
    if (appCreds) {
      return getMetaCredentialFingerprint(appCreds.appId);
    }

    const token = parseMetaTokenFromHeaders(headers);
    return getMetaCredentialFingerprint(token);
  }
}
