// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { BulkCapacityBucket, RateLimiter } from "@cesteral/shared";

/**
 * Rate-limit scope of a Pinterest session: the Pinterest user its token acts as.
 *
 * basis: every v5 operation carries an `x-ratelimit-category` (ads_read,
 * ads_write, ads_analytics, org_read, org_write, …) and "operations that share
 * a rate limit category will share rate limit quota" (pinterest/api-description
 * v5/openapi.json 5.28.0 + extensions.md:13 — primary). The scope of a
 * category's quota is "per user per app" only in search snippets
 * (docs/reviews/2026-09-fleet-review/_quotas-social.md §4 — corroboration
 * only), and no number is primary-sourced; platform-facts
 * `pinterest.rate_limit_default` stays `unverified`.
 *
 * So every bucket belongs to the session's Pinterest user, and the split the
 * keys already had is kept under it:
 *
 *   `pinterest:user:{quotaUser}:account:{adAccountId}` — calls on the session's
 *                                          ad account: entity CRUD, Pins, media,
 *                                          audience sizing, previews
 *   `pinterest:user:{quotaUser}`         — calls on no ad account: the ad-account
 *                                          list, targeting resources
 *   `pinterest:user:{quotaUser}:reporting` — the analytics reports (ads_analytics)
 *
 * `quotaUser` is the `id` of `GET /v5/user_account`, which the auth adapter
 * learns in `validate()` — never the token (rate-limit errors echo the key) and
 * never anything the MCP caller sends. The ad account is caller input (the
 * `X-Pinterest-Advertiser-Id` header, and the tool argument checked against
 * it), which is why it sits UNDER the user: a tenant naming someone else's
 * account reaches only its own bucket.
 *
 * The keys this replaced — `pinterest:default` and `pinterest:reporting` — were
 * one bucket per PROCESS shared by every HTTP tenant, and `pinterest:{adAccountId}`
 * was shared by any tenant naming that account (#237). For one user the
 * throughput is unchanged: the same default applies to each bucket as before.
 */
export interface PinterestQuotaScope {
  /** The session's Pinterest user id (see `PinterestAuthAdapter.quotaUser`). */
  readonly quotaUser: string;
}

/**
 * Take `tokens` from the scope's bucket for `adAccountId`, queueing as the
 * limiter does. The key MUST stay in step with {@link pinterestAccountQuotaBucket}
 * — `pinterest-rate-limit-keys.test.ts` asserts they do. Template literals (not
 * a shared key builder) so the fleet ratchet in `scripts/lib/rate-limit-keys.test.mjs`
 * can see the `pinterest:` prefix.
 */
export async function consumePinterestAccountQuota(
  rateLimiter: RateLimiter,
  scope: PinterestQuotaScope,
  adAccountId: string,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`pinterest:user:${scope.quotaUser}:account:${adAccountId}`, tokens);
}

/** Take `tokens` from the scope's account-less bucket. */
export async function consumePinterestUserQuota(
  rateLimiter: RateLimiter,
  scope: PinterestQuotaScope,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`pinterest:user:${scope.quotaUser}`, tokens);
}

/** Take `tokens` from the scope's reporting bucket. */
export async function consumePinterestReportingQuota(
  rateLimiter: RateLimiter,
  scope: PinterestQuotaScope,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`pinterest:user:${scope.quotaUser}:reporting`, tokens);
}

/**
 * The bucket {@link consumePinterestAccountQuota} draws on, for the bulk
 * capacity projection: `costPerItem` has one entry per `consume` an item makes.
 */
export function pinterestAccountQuotaBucket(
  scope: PinterestQuotaScope,
  adAccountId: string,
  costPerItem: readonly number[]
): BulkCapacityBucket {
  return { key: `pinterest:user:${scope.quotaUser}:account:${adAccountId}`, costPerItem };
}

/** The bucket {@link consumePinterestUserQuota} draws on. */
export function pinterestUserQuotaBucket(
  scope: PinterestQuotaScope,
  costPerItem: readonly number[]
): BulkCapacityBucket {
  return { key: `pinterest:user:${scope.quotaUser}`, costPerItem };
}

/** The bucket {@link consumePinterestReportingQuota} draws on. */
export function pinterestReportingQuotaBucket(
  scope: PinterestQuotaScope,
  costPerItem: readonly number[]
): BulkCapacityBucket {
  return { key: `pinterest:user:${scope.quotaUser}:reporting`, costPerItem };
}
