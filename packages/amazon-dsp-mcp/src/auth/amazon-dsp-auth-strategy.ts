// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
import { extractHeader } from "@cesteral/shared";
import {
  AmazonDspAccessTokenAdapter,
  AmazonDspRefreshTokenAdapter,
  parseAmazonDspTokenFromHeaders,
  parseAmazonDspRefreshCredentialsFromHeaders,
  getAmazonDspProfileIdFromHeaders,
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

  private getClientIdFromHeaders(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    return extractHeader(headers, "amazon-advertising-api-clientid");
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    const refreshCreds = parseAmazonDspRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return null;

    const profileId = getAmazonDspProfileIdFromHeaders(headers);
    const clientId = this.getClientIdFromHeaders(headers) ?? refreshCreds.appId;
    const adapter = new AmazonDspRefreshTokenAdapter(refreshCreds, profileId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      // Fingerprint based on app ID + advertiser (stable, not the rotating token)
      fingerprint: getAmazonDspCredentialFingerprint(refreshCreds.appId, profileId),
      userId: adapter.userId,
      authFlow: "refresh-token",
      logContext: { profileId, clientId },
    };
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parseAmazonDspTokenFromHeaders(headers);
    const profileId = getAmazonDspProfileIdFromHeaders(headers);
    const clientId = this.getClientIdFromHeaders(headers);
    const adapter = new AmazonDspAccessTokenAdapter(token, profileId, this.baseUrl, clientId);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getAmazonDspCredentialFingerprint(token, profileId),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { profileId, clientId },
    };
  }

  protected getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const refreshCreds = parseAmazonDspRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return undefined;
    const profileId = getAmazonDspProfileIdFromHeaders(headers);
    return getAmazonDspCredentialFingerprint(refreshCreds.appId, profileId);
  }

  protected getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string {
    const token = parseAmazonDspTokenFromHeaders(headers);
    const profileId = getAmazonDspProfileIdFromHeaders(headers);
    return getAmazonDspCredentialFingerprint(token, profileId);
  }
}