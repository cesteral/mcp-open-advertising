// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Bearer Auth Strategy
 *
 * Implements the shared AuthStrategy interface for Snapchat Ads.
 * Supports two credential flows:
 * 1. Static Bearer token (Authorization header) — for pre-generated tokens
 * 2. Refresh token flow (X-Snapchat-App-Id/Secret/Refresh-Token headers) —
 *    auto-refreshes access tokens (recommended for production, 24h token expiry)
 *
 * Falls back to static token if refresh credentials are not provided.
 *
 * Snapchat-specific: also extracts X-Snapchat-Advertiser-Id from headers, which is
 * required for all API calls and included in the credential fingerprint.
 */

import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  SnapchatAccessTokenAdapter,
  SnapchatRefreshTokenAdapter,
  parseSnapchatTokenFromHeaders,
  parseSnapchatRefreshCredentialsFromHeaders,
  getSnapchatAdvertiserIdFromHeaders,
  getSnapchatOrgIdFromHeaders,
  getSnapchatCredentialFingerprint,
} from "./snapchat-auth-adapter.js";

export class SnapchatBearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "snapchat-bearer";
  protected readonly platformName = "Snapchat";

  constructor(
    private readonly baseUrl: string,
    logger?: Logger
  ) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    const refreshCreds = parseSnapchatRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return null;

    const adAccountId = getSnapchatAdvertiserIdFromHeaders(headers);
    const orgId = getSnapchatOrgIdFromHeaders(headers);
    const adapter = new SnapchatRefreshTokenAdapter(refreshCreds, adAccountId, this.baseUrl, orgId);
    await adapter.validate();

    return {
      adapter,
      // Fingerprint based on app ID + advertiser (stable, not the rotating token)
      fingerprint: getSnapchatCredentialFingerprint(refreshCreds.appId, adAccountId),
      userId: adapter.userId,
      authFlow: "refresh-token",
      logContext: { adAccountId, orgId },
    };
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parseSnapchatTokenFromHeaders(headers);
    const adAccountId = getSnapchatAdvertiserIdFromHeaders(headers);
    const orgId = getSnapchatOrgIdFromHeaders(headers);
    const adapter = new SnapchatAccessTokenAdapter(token, adAccountId, this.baseUrl, orgId);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getSnapchatCredentialFingerprint(token, adAccountId),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { adAccountId, orgId },
    };
  }

  protected getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const refreshCreds = parseSnapchatRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return undefined;
    const adAccountId = getSnapchatAdvertiserIdFromHeaders(headers);
    return getSnapchatCredentialFingerprint(refreshCreds.appId, adAccountId);
  }

  protected getTokenFingerprint(headers: Record<string, string | string[] | undefined>): string {
    const token = parseSnapchatTokenFromHeaders(headers);
    const adAccountId = getSnapchatAdvertiserIdFromHeaders(headers);
    return getSnapchatCredentialFingerprint(token, adAccountId);
  }
}
