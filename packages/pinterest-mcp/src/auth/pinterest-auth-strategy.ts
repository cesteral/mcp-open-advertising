// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for Pinterest Ads.
 * Supports two credential flows:
 * 1. Static Bearer token (Authorization header) — for pre-generated tokens
 * 2. Refresh token flow (X-Pinterest-App-Id/Secret/Refresh-Token headers) —
 *    auto-refreshes access tokens (recommended for production, 24h token expiry)
 *
 * Falls back to static token if refresh credentials are not provided.
 *
 * Pinterest-specific: also extracts X-Pinterest-Advertiser-Id from headers, which is
 * required for all API calls and included in the credential fingerprint.
 */

import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  PinterestAccessTokenAdapter,
  PinterestRefreshTokenAdapter,
  parsePinterestTokenFromHeaders,
  parsePinterestRefreshCredentialsFromHeaders,
  getPinterestAdvertiserIdFromHeaders,
  getPinterestCredentialFingerprint,
} from "./pinterest-auth-adapter.js";

export class PinterestBearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "pinterest-bearer";
  protected readonly platformName = "Pinterest";

  constructor(
    private readonly baseUrl: string,
    logger?: Logger
  ) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    const refreshCreds = parsePinterestRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return null;

    const adAccountId = getPinterestAdvertiserIdFromHeaders(headers);
    const adapter = new PinterestRefreshTokenAdapter(refreshCreds, adAccountId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      // Fingerprint based on app ID + advertiser (stable, not the rotating token)
      fingerprint: getPinterestCredentialFingerprint(refreshCreds.appId, adAccountId),
      userId: adapter.userId,
      authFlow: "refresh-token",
      logContext: { adAccountId },
    };
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parsePinterestTokenFromHeaders(headers);
    const adAccountId = getPinterestAdvertiserIdFromHeaders(headers);
    const adapter = new PinterestAccessTokenAdapter(token, adAccountId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getPinterestCredentialFingerprint(token, adAccountId),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { adAccountId },
    };
  }

  protected getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const refreshCreds = parsePinterestRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return undefined;
    const adAccountId = getPinterestAdvertiserIdFromHeaders(headers);
    return getPinterestCredentialFingerprint(refreshCreds.appId, adAccountId);
  }

  protected getTokenFingerprint(headers: Record<string, string | string[] | undefined>): string {
    const token = parsePinterestTokenFromHeaders(headers);
    const adAccountId = getPinterestAdvertiserIdFromHeaders(headers);
    return getPinterestCredentialFingerprint(token, adAccountId);
  }
}
