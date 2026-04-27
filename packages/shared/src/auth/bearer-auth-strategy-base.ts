// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * BearerAuthStrategyBase
 *
 * Abstract base class for platform-specific bearer auth strategies (Meta, LinkedIn, TikTok).
 *
 * All three platforms share the same two-branch verify() pattern:
 *  1. Refresh/exchange credentials branch (preferred when present)
 *  2. Static access token branch (fallback)
 *
 * And the same getCredentialFingerprint() pattern:
 *  - Parse headers only, no network calls
 *
 * Subclasses implement platform-specific adapter creation and header parsing
 * via four abstract methods; the base class handles the shared control flow.
 */

import type { Logger } from "pino";
import type { AuthStrategy, AuthResult } from "./auth-strategy.js";

/**
 * Result of a fully-resolved auth branch (after adapter.validate() has been called).
 * The userId field must be populated — typically set during validate().
 */
export interface BearerAdapterResult {
  /** The platform auth adapter (stored as platformAuthAdapter on AuthResult) */
  adapter: unknown;
  /** Stable credential fingerprint for session reuse */
  fingerprint: string;
  /** User/account identifier — populated after validate() */
  userId: string;
  /** Auth flow label for debug logging (e.g., "refresh-token", "static-token") */
  authFlow: string;
  /** Additional context for debug log (e.g., { personId }) */
  logContext?: Record<string, unknown>;
}

export abstract class BearerAuthStrategyBase implements AuthStrategy {
  constructor(protected readonly logger?: Logger) {}

  // ── Abstract methods for verify() ────────────────────────────────────────

  /**
   * Try the refresh/exchange credential flow.
   * MUST call adapter.validate() before returning so that userId is populated.
   * Return null if the refresh credentials are absent from the headers.
   */
  protected abstract resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null>;

  /**
   * Use the static access token flow (always available as fallback).
   * MUST call adapter.validate() before returning so that userId is populated.
   */
  protected abstract resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult>;

  // ── Abstract methods for getCredentialFingerprint() ─────────────────────

  /**
   * Return the stable credential fingerprint from refresh credentials headers.
   * MUST NOT make network calls.
   * Return undefined if refresh credentials are absent.
   */
  protected abstract getRefreshFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined;

  /**
   * Return the credential fingerprint from the static access token header.
   * MUST NOT make network calls.
   */
  protected abstract getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string;

  // ── Abstract platform metadata ────────────────────────────────────────────

  /** Auth type string for authInfo.authType (e.g., "meta-bearer") */
  protected abstract readonly authType: string;

  /** Platform name for log messages (e.g., "Meta") */
  protected abstract readonly platformName: string;

  // ── Shared verify() implementation ───────────────────────────────────────

  async verify(headers: Record<string, string | string[] | undefined>): Promise<AuthResult> {
    const branch =
      (await this.resolveRefreshBranch(headers)) ?? (await this.resolveAccessBranch(headers));

    this.logger?.debug(
      { userId: branch.userId, authFlow: branch.authFlow, ...branch.logContext },
      `${this.platformName} credentials validated (${branch.authFlow})`
    );

    // NOTE: allowedAdvertisers is intentionally not set for bearer-token sessions.
    // Bearer token auth is trusted at the connection level (the token itself acts
    // as the credential bound to the ad account via the adapter's adAccountId/profileId).
    // JWT scope enforcement (allowedAdvertisers check in registerToolsFromDefinitions)
    // only activates in jwt mode where the JWT explicitly declares allowed advertiser IDs.
    // If per-call advertiser scoping is needed in bearer-token mode, implement it
    // inside the individual auth adapters' validate() method or add it here.
    return {
      authInfo: {
        clientId: branch.userId,
        subject: branch.userId,
        authType: this.authType,
      },
      platformAuthAdapter: branch.adapter,
      credentialFingerprint: branch.fingerprint,
    };
  }

  // ── Shared getCredentialFingerprint() implementation ─────────────────────

  async getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): Promise<string | undefined> {
    return this.getRefreshFingerprint(headers) ?? this.getTokenFingerprint(headers);
  }
}
