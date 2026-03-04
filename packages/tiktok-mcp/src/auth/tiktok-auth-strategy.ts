/**
 * TikTok Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for TikTok Ads.
 * Parses Bearer token from Authorization header and advertiser ID from
 * X-TikTok-Advertiser-Id header. Creates a TikTokAccessTokenAdapter
 * and validates by calling GET /open_api/v1.3/user/info/.
 */

import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import type { Logger } from "pino";
import {
  TikTokAccessTokenAdapter,
  parseTikTokTokenFromHeaders,
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
    const token = parseTikTokTokenFromHeaders(headers);
    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);
    const adapter = new TikTokAccessTokenAdapter(token, advertiserId, this.baseUrl);

    // Validate by calling GET /open_api/v1.3/user/info/
    await adapter.validate();

    this.logger?.debug(
      { userId: adapter.userId, advertiserId },
      "TikTok credentials validated"
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
    const token = parseTikTokTokenFromHeaders(headers);
    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);
    return getTikTokCredentialFingerprint(token, advertiserId);
  }
}
