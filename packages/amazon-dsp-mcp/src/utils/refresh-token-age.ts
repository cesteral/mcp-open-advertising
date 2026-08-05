// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Refresh-token age evaluation for Amazon's 365-day refresh-token lifetime.
 *
 * Refresh tokens for the advertising::campaign_management and
 * advertising::audiences scopes obtained from consent granted on or after
 * 2026-07-30 expire 365 days after issuance; the advertiser must re-authorize
 * annually. Consent granted before that date is unaffected.
 *
 * This only covers the env-configured deployment token
 * (AMAZON_DSP_REFRESH_TOKEN): in HTTP mode each session supplies its own
 * refresh token via headers, and the server has no way to know that token's
 * issuance date — age tracking for per-session tokens belongs to whoever
 * issued them.
 */

/** Amazon's refresh-token lifetime for consent granted on/after 2026-07-30. */
export const AMAZON_REFRESH_TOKEN_MAX_AGE_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RefreshTokenAgeEvaluation {
  ageDays: number;
  daysUntilExpiry: number;
  /** True once age crosses the warn threshold (still working, action needed). */
  warn: boolean;
  /** True once the 365-day lifetime has fully elapsed. */
  expired: boolean;
}

/**
 * Evaluate the age of a refresh token against Amazon's 365-day lifetime.
 * Returns undefined when `issuedAt` is absent or unparseable — tracking is
 * strictly opt-in via AMAZON_DSP_REFRESH_TOKEN_ISSUED_AT.
 */
export function evaluateRefreshTokenAge(
  issuedAt: string | undefined,
  now: Date,
  warnAgeDays: number
): RefreshTokenAgeEvaluation | undefined {
  if (!issuedAt) return undefined;

  const issuedAtMs = Date.parse(issuedAt);
  if (Number.isNaN(issuedAtMs) || issuedAtMs > now.getTime()) return undefined;

  const ageDays = Math.floor((now.getTime() - issuedAtMs) / MS_PER_DAY);
  const daysUntilExpiry = AMAZON_REFRESH_TOKEN_MAX_AGE_DAYS - ageDays;

  return {
    ageDays,
    daysUntilExpiry,
    warn: ageDays >= warnAgeDays,
    expired: daysUntilExpiry <= 0,
  };
}

/**
 * Build the operator-facing /health block (and log payload) for the
 * env-configured refresh token. Undefined when tracking is not configured.
 */
export function buildRefreshTokenAgeHealth(
  issuedAt: string | undefined,
  now: Date,
  warnAgeDays: number
): Record<string, unknown> | undefined {
  const evaluation = evaluateRefreshTokenAge(issuedAt, now, warnAgeDays);
  if (!evaluation) return undefined;

  return {
    refreshTokenIssuedAt: issuedAt,
    refreshTokenAgeDays: evaluation.ageDays,
    refreshTokenDaysUntilExpiry: evaluation.daysUntilExpiry,
    refreshTokenStatus: evaluation.expired
      ? "expired"
      : evaluation.warn
        ? "reauthorization-needed-soon"
        : "ok",
  };
}
