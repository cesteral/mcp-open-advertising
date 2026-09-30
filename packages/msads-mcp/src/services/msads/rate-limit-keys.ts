// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { BulkCapacityBucket, RateLimiter } from "@cesteral/shared";

/**
 * Rate-limit scope of a Microsoft Ads session.
 *
 * Microsoft throttles Campaign Management and Ad Insight per user per minute,
 * AND per customer over a 60-second sliding window (services-protocol.md,
 * "Handle Throttling"; platform-facts `msads.rate_limit_default`). Every call
 * therefore draws on two buckets, one per axis, and must clear both:
 *
 *   `msads:user:{userId}:{kind}`         — the authenticated user
 *   `msads:customer:{customerId}:{kind}` — the customer whose data is accessed
 *
 * The keys this replaced (`msads:read` / `msads:write`) were shared by every
 * tenant on the instance, so one tenant's bulk job queued everyone else's.
 * For a single user on a single customer the two buckets drain in lockstep,
 * so throughput there is unchanged.
 *
 * `kind` keeps the read/write split the old keys had: writes cost 3 tokens and
 * would otherwise starve reads. Both kinds count against the same platform
 * quota, which publishes no value; the default is unsourced either way.
 *
 * The session's auth adapter satisfies this interface. `userId` is read at
 * each call because the adapter learns it during `validate()`.
 */
export interface MsAdsQuotaScope {
  readonly userId: string;
  readonly customerId: string;
}

export type MsAdsQuotaKind = "read" | "write";

/** `userId` is empty before validation and "unknown" when User/Query omits it. */
function userSegment(scope: MsAdsQuotaScope): string {
  return scope.userId || "unvalidated";
}

function customerSegment(scope: MsAdsQuotaScope): string {
  return scope.customerId || "unknown";
}

/**
 * Take `tokens` from both of the scope's buckets for `kind`, queueing on each
 * as the limiter does. The two keys MUST stay in step with
 * {@link msadsQuotaBuckets} — `rate-limit-keys.test.ts` asserts they do.
 * Template literals (not a shared key builder) so the fleet ratchet in
 * `scripts/lib/rate-limit-keys.test.mjs` can see the `msads:` prefix.
 */
export async function consumeMsAdsQuota(
  rateLimiter: RateLimiter,
  scope: MsAdsQuotaScope,
  kind: MsAdsQuotaKind,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`msads:user:${userSegment(scope)}:${kind}`, tokens);
  await rateLimiter.consume(`msads:customer:${customerSegment(scope)}:${kind}`, tokens);
}

/**
 * The buckets {@link consumeMsAdsQuota} draws on, for the bulk capacity
 * projection: one entry per axis, each costing `costPerItem`.
 */
export function msadsQuotaBuckets(
  scope: MsAdsQuotaScope,
  kind: MsAdsQuotaKind,
  costPerItem: readonly number[]
): BulkCapacityBucket[] {
  return [
    { key: `msads:user:${userSegment(scope)}:${kind}`, costPerItem },
    { key: `msads:customer:${customerSegment(scope)}:${kind}`, costPerItem },
  ];
}
