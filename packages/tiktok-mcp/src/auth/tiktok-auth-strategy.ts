/**
 * TikTok Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for TikTok Ads.
 * Supports two credential flows:
 * 1. Static Bearer token (Authorization header) — for pre-generated tokens
 * 2. Refresh token flow (X-TikTok-App-Id/Secret/Refresh-Token headers) —
 *    auto-refreshes access tokens (recommended for production, 24h token expiry)
 *
 * Falls back to static token if refresh credentials are not provided.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  TikTokAccessTokenAdapter,
  TikTokRefreshTokenAdapter,
  parseTikTokTokenFromHeaders,
  parseTikTokRefreshCredentialsFromHeaders,
  getTikTokAdvertiserIdFromHeaders,
  getTikTokCredentialFingerprint,
} from "./tiktok-auth-adapter.js";

export class TikTokBearerAuthStrategy implements AuthStrategy {
  constructor(
    private readonly baseUrl: string,
    private readonly logger?: Logger
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);

    // Prefer refresh token flow if all credentials are present
    const refreshCreds = parseTikTokRefreshCredentialsFromHeaders(headers);
    if (refreshCreds) {
      const adapter = new TikTokRefreshTokenAdapter(refreshCreds, advertiserId, this.baseUrl);
      await adapter.validate();

      this.logger?.debug(
        { userId: adapter.userId, advertiserId, authFlow: "refresh-token" },
        "TikTok credentials validated (refresh token flow)"
      );

      // Fingerprint based on app ID + advertiser (stable, not the rotating token)
      const fingerprint = getTikTokCredentialFingerprint(
        refreshCreds.appId,
        advertiserId
      );

      return {
        authInfo: {
          clientId: adapter.userId,
          subject: adapter.userId,
          authType: "tiktok-bearer",
        },
        platformAuthAdapter: adapter,
        credentialFingerprint: fingerprint,
      };
    }

    // Fallback: static Bearer token
    const token = parseTikTokTokenFromHeaders(headers);
    const adapter = new TikTokAccessTokenAdapter(token, advertiserId, this.baseUrl);

    await adapter.validate();

    this.logger?.debug(
      { userId: adapter.userId, advertiserId, authFlow: "static-token" },
      "TikTok credentials validated (static token)"
    );

    const fingerprint = getTikTokCredentialFingerprint(token, advertiserId);

    return {
      authInfo: {
        clientId: adapter.userId,
        subject: adapter.userId,
        authType: "tiktok-bearer",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);

    // Use refresh creds fingerprint if available
    const refreshCreds = parseTikTokRefreshCredentialsFromHeaders(headers);
    if (refreshCreds) {
      return getTikTokCredentialFingerprint(refreshCreds.appId, advertiserId);
    }

    const token = parseTikTokTokenFromHeaders(headers);
    return getTikTokCredentialFingerprint(token, advertiserId);
  }
}
