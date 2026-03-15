// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
 *
 * TikTok-specific: also extracts X-TikTok-Advertiser-Id from headers, which is
 * required for all API calls and included in the credential fingerprint.
 */

import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  TikTokAccessTokenAdapter,
  TikTokRefreshTokenAdapter,
  parseTikTokTokenFromHeaders,
  parseTikTokRefreshCredentialsFromHeaders,
  getTikTokAdvertiserIdFromHeaders,
  getTikTokCredentialFingerprint,
} from "./tiktok-auth-adapter.js";

export class TikTokBearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "tiktok-bearer";
  protected readonly platformName = "TikTok";

  constructor(
    private readonly baseUrl: string,
    logger?: Logger
  ) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    const refreshCreds = parseTikTokRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return null;

    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);
    const adapter = new TikTokRefreshTokenAdapter(refreshCreds, advertiserId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      // Fingerprint based on app ID + advertiser (stable, not the rotating token)
      fingerprint: getTikTokCredentialFingerprint(refreshCreds.appId, advertiserId),
      userId: adapter.userId,
      authFlow: "refresh-token",
      logContext: { advertiserId },
    };
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parseTikTokTokenFromHeaders(headers);
    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);
    const adapter = new TikTokAccessTokenAdapter(token, advertiserId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getTikTokCredentialFingerprint(token, advertiserId),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { advertiserId },
    };
  }

  protected getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const refreshCreds = parseTikTokRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return undefined;
    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);
    return getTikTokCredentialFingerprint(refreshCreds.appId, advertiserId);
  }

  protected getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string {
    const token = parseTikTokTokenFromHeaders(headers);
    const advertiserId = getTikTokAdvertiserIdFromHeaders(headers);
    return getTikTokCredentialFingerprint(token, advertiserId);
  }
}