/**
 * AmazonDsp Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for AmazonDsp Ads.
 * Supports two credential flows:
 * 1. Static Bearer token (Authorization header) — for pre-generated tokens
 * 2. Refresh token flow (X-AmazonDsp-App-Id/Secret/Refresh-Token headers) —
 *    auto-refreshes access tokens (recommended for production, 24h token expiry)
 *
 * Falls back to static token if refresh credentials are not provided.
 *
 * AmazonDsp-specific: also extracts X-AmazonDsp-Advertiser-Id from headers, which is
 * required for all API calls and included in the credential fingerprint.
 */

import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  AmazonDspAccessTokenAdapter,
  AmazonDspRefreshTokenAdapter,
  parseAmazonDspTokenFromHeaders,
  parseAmazonDspRefreshCredentialsFromHeaders,
  getAmazonDspAdvertiserIdFromHeaders,
  getAmazonDspCredentialFingerprint,
} from "./amazon-dsp-auth-adapter.js";

export class AmazonDspBearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "amazon-dsp-bearer";
  protected readonly platformName = "AmazonDsp";

  constructor(
    private readonly baseUrl: string,
    logger?: Logger
  ) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    const refreshCreds = parseAmazonDspRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return null;

    const profileId = getAmazonDspAdvertiserIdFromHeaders(headers);
    const adapter = new AmazonDspRefreshTokenAdapter(refreshCreds, profileId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      // Fingerprint based on app ID + advertiser (stable, not the rotating token)
      fingerprint: getAmazonDspCredentialFingerprint(refreshCreds.appId, profileId),
      userId: adapter.userId,
      authFlow: "refresh-token",
      logContext: { profileId },
    };
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parseAmazonDspTokenFromHeaders(headers);
    const profileId = getAmazonDspAdvertiserIdFromHeaders(headers);
    const adapter = new AmazonDspAccessTokenAdapter(token, profileId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getAmazonDspCredentialFingerprint(token, profileId),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { profileId },
    };
  }

  protected getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const refreshCreds = parseAmazonDspRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return undefined;
    const profileId = getAmazonDspAdvertiserIdFromHeaders(headers);
    return getAmazonDspCredentialFingerprint(refreshCreds.appId, profileId);
  }

  protected getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string {
    const token = parseAmazonDspTokenFromHeaders(headers);
    const profileId = getAmazonDspAdvertiserIdFromHeaders(headers);
    return getAmazonDspCredentialFingerprint(token, profileId);
  }
}
