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

import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  LinkedInAccessTokenAdapter,
  LinkedInRefreshTokenAdapter,
  parseLinkedInTokenFromHeaders,
  parseLinkedInRefreshCredentialsFromHeaders,
  getLinkedInCredentialFingerprint,
} from "./linkedin-auth-adapter.js";

export class LinkedInBearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "linkedin-bearer";
  protected readonly platformName = "LinkedIn";

  constructor(
    private readonly baseUrl: string,
    private readonly apiVersion: string,
    logger?: Logger
  ) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    const refreshCreds = parseLinkedInRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return null;

    const adapter = new LinkedInRefreshTokenAdapter(refreshCreds, this.baseUrl, this.apiVersion);
    await adapter.validate();

    return {
      adapter,
      // Fingerprint based on client ID (stable, not the rotating token)
      fingerprint: getLinkedInCredentialFingerprint(refreshCreds.clientId),
      userId: adapter.personId,
      authFlow: "refresh-token",
      logContext: { personId: adapter.personId },
    };
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parseLinkedInTokenFromHeaders(headers);
    const adapter = new LinkedInAccessTokenAdapter(token, this.baseUrl, this.apiVersion);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getLinkedInCredentialFingerprint(token),
      userId: adapter.personId,
      authFlow: "static-token",
      logContext: { personId: adapter.personId },
    };
  }

  protected getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const refreshCreds = parseLinkedInRefreshCredentialsFromHeaders(headers);
    if (!refreshCreds) return undefined;
    return getLinkedInCredentialFingerprint(refreshCreds.clientId);
  }

  protected getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string {
    const token = parseLinkedInTokenFromHeaders(headers);
    return getLinkedInCredentialFingerprint(token);
  }
}
