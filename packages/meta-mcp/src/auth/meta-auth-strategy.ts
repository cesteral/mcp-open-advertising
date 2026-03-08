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

import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  MetaAccessTokenAdapter,
  MetaRefreshTokenAdapter,
  parseMetaTokenFromHeaders,
  parseMetaAppCredentialsFromHeaders,
  getMetaCredentialFingerprint,
} from "./meta-auth-adapter.js";

export class MetaBearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "meta-bearer";
  protected readonly platformName = "Meta";

  constructor(
    private readonly baseUrl: string,
    logger?: Logger
  ) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    // Prefer token exchange flow if app credentials are present
    const appCreds = parseMetaAppCredentialsFromHeaders(headers);
    if (!appCreds) return null;

    const token = parseMetaTokenFromHeaders(headers);
    const adapter = new MetaRefreshTokenAdapter(token, appCreds, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getMetaCredentialFingerprint(appCreds.appId),
      userId: adapter.userId,
      authFlow: "token-exchange",
      logContext: { userId: adapter.userId },
    };
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parseMetaTokenFromHeaders(headers);
    const adapter = new MetaAccessTokenAdapter(token, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      fingerprint: getMetaCredentialFingerprint(token),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { userId: adapter.userId },
    };
  }

  protected getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    const appCreds = parseMetaAppCredentialsFromHeaders(headers);
    if (!appCreds) return undefined;
    return getMetaCredentialFingerprint(appCreds.appId);
  }

  protected getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string {
    const token = parseMetaTokenFromHeaders(headers);
    return getMetaCredentialFingerprint(token);
  }
}
