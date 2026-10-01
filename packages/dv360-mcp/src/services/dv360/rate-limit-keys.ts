// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { BulkCapacityBucket, RateLimiter } from "@cesteral/shared";

/**
 * Rate-limit scope of a DV360 call: the owner the call acts on.
 *
 *   `dv360:{advertiserId}`         — any call that names an advertiser
 *   `dv360:partner:{partnerId}`    — a call that names only a partner
 *
 * basis: DV360 counts requests per advertiser per project (300/min, 150 writes)
 * and per project (1,500/min, 700 writes), per
 * developers.google.com/display-video/api/limits as quoted in
 * docs/reviews/2026-09-fleet-review/_quotas-google.md (corroboration only;
 * platform-facts `dv360.rate_limit_default` stays `unverified`). The
 * per-advertiser key predates this module and is unchanged.
 *
 * The partner key is new (#236, dv360 #24). A call naming only a partner —
 * a partner-owned custom bidding algorithm and its scripts/rules, an
 * inventory source or advertiser list scoped by `partnerId` — used to draw no
 * token at all, because every consume site was guarded on `advertiserId`. It
 * falls under no per-advertiser quota, only the project one, so a
 * per-partner bucket at the same default is strictly more conservative than
 * the nothing it replaces; it is not a claim about a partner-level quota.
 *
 * An advertiser-owned custom bidding algorithm carries its owner as a query
 * parameter, not in the path; it still draws on the owning advertiser's
 * bucket, the one the rest of that advertiser's traffic shares.
 *
 * A call naming neither (the bare `/partners` list) still draws nothing.
 */
export interface Dv360QuotaOwner {
  readonly advertiserId?: string;
  readonly partnerId?: string;
}

/**
 * Take `tokens` from the owner's bucket, queueing as the limiter does:
 * the advertiser's when one is named, else the partner's. The keys MUST stay in
 * step with {@link dv360QuotaBucket} — `dv360-rate-limit-keys.test.ts` asserts
 * they do. Template literals (not a shared key builder) so the fleet ratchet in
 * `scripts/lib/rate-limit-keys.test.mjs` can see the `dv360:` prefix.
 */
export async function consumeDv360Quota(
  rateLimiter: RateLimiter,
  owner: Dv360QuotaOwner,
  tokens: number = 1
): Promise<void> {
  if (owner.advertiserId) {
    await rateLimiter.consume(`dv360:${owner.advertiserId}`, tokens);
  } else if (owner.partnerId) {
    await rateLimiter.consume(`dv360:partner:${owner.partnerId}`, tokens);
  }
}

/**
 * The bucket {@link consumeDv360Quota} draws on for `owner`, for the bulk
 * capacity projection, or `undefined` when it draws on none.
 */
export function dv360QuotaBucket(
  owner: Dv360QuotaOwner,
  costPerItem: readonly number[]
): BulkCapacityBucket | undefined {
  if (owner.advertiserId) return { key: `dv360:${owner.advertiserId}`, costPerItem };
  if (owner.partnerId) return { key: `dv360:partner:${owner.partnerId}`, costPerItem };
  return undefined;
}
