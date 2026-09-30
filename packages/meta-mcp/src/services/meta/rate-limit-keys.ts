// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { BulkCapacityBucket, RateLimiter } from "@cesteral/shared";

/**
 * Rate-limit scope of a Meta session: the Graph API user its token acts as.
 *
 * Meta scores Marketing API calls per ad account (read 1 point, write 3) and
 * also throttles per user and per app (codes 17 "API User Too Many Calls" and
 * 4). basis: the rate-limiting page as mirrored in
 * docs/reviews/2026-09-fleet-review/_quotas-social.md §1 (corroboration only;
 * the vendor host is blocked) and the throttle codes Meta's own SDKs map
 * (`meta-graph-api-client.ts` RATE_LIMIT_CODES). No number is primary-sourced;
 * platform-facts `meta.rate_limit_default` stays `unverified`.
 *
 * So there are two kinds of bucket, both owned by the session's Graph user:
 *
 *   `meta:user:{quotaUser}`                       — calls not addressed to a named
 *                                                   ad account (node reads and
 *                                                   writes by id, insights,
 *                                                   targeting search, /me/adaccounts)
 *   `meta:user:{quotaUser}:account:act_{id}`      — calls on a named ad account
 *                                                   (list, create, uploads,
 *                                                   delivery estimate, targetingbrowse)
 *
 * `quotaUser` is the `/me` id the auth adapter learns in `validate()` — never
 * the token (rate-limit errors echo the key) and never anything the MCP caller
 * sends. The ad-account segment is caller input, which is why it sits UNDER
 * the user: a tenant naming someone else's account id reaches only its own
 * bucket, never the other tenant's.
 *
 * The key this replaced, `meta:default`, was one bucket per PROCESS shared by
 * every HTTP tenant, so one tenant's bulk job queued everyone else's (#237,
 * meta #10). The per-account keys it sat beside were `meta:${adAccountId}`
 * exactly as the caller typed it, so `act_123` and `123` were two buckets for
 * one account (#236); the account segment is now normalized.
 *
 * For one user the throughput is unchanged: the same default applies to the
 * user bucket and to each account bucket, as it did to `meta:default` and each
 * `meta:${adAccountId}`.
 */
export interface MetaQuotaScope {
  /** The session's Graph user id (see `MetaAuthAdapter.quotaUser`). */
  readonly quotaUser: string;
}

/** `act_{id}` for either `act_{id}` or a bare `{id}` — Graph's ad-account node id. */
export function normalizeMetaAdAccountId(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}

/**
 * Take `tokens` from the scope's user bucket, queueing as the limiter does.
 * The key MUST stay in step with {@link metaUserQuotaBucket} —
 * `meta-rate-limit-keys.test.ts` asserts they do. A template literal (not a
 * shared key builder) so the fleet ratchet in
 * `scripts/lib/rate-limit-keys.test.mjs` can see the `meta:` prefix.
 */
export async function consumeMetaUserQuota(
  rateLimiter: RateLimiter,
  scope: MetaQuotaScope,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`meta:user:${scope.quotaUser}`, tokens);
}

/**
 * Take `tokens` from the scope's bucket for `adAccountId` (normalized to
 * `act_{id}`). In step with {@link metaAccountQuotaBucket}.
 */
export async function consumeMetaAccountQuota(
  rateLimiter: RateLimiter,
  scope: MetaQuotaScope,
  adAccountId: string,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(
    `meta:user:${scope.quotaUser}:account:${normalizeMetaAdAccountId(adAccountId)}`,
    tokens
  );
}

/**
 * The bucket {@link consumeMetaUserQuota} draws on, for the bulk capacity
 * projection: `costPerItem` has one entry per `consume` an item makes.
 */
export function metaUserQuotaBucket(
  scope: MetaQuotaScope,
  costPerItem: readonly number[]
): BulkCapacityBucket {
  return { key: `meta:user:${scope.quotaUser}`, costPerItem };
}

/** The bucket {@link consumeMetaAccountQuota} draws on for `adAccountId`. */
export function metaAccountQuotaBucket(
  scope: MetaQuotaScope,
  adAccountId: string,
  costPerItem: readonly number[]
): BulkCapacityBucket {
  return {
    key: `meta:user:${scope.quotaUser}:account:${normalizeMetaAdAccountId(adAccountId)}`,
    costPerItem,
  };
}
