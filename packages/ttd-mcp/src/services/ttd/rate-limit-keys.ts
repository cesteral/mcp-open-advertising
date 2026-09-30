// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { BulkCapacityBucket, RateLimiter } from "@cesteral/shared";

/**
 * Rate-limit scope of a TTD session: the API client TTD counts calls against.
 *
 * TTD Foundations §12 "Rate Limits" (vendored at
 * `packages/ttd-mcp/docs/api/TTD_Foundations.md`; platform-facts
 * `ttd.rate_limit_default`): "API endpoint limits are defined as a maximum
 * number of calls **a client** can make to each platform endpoint within a time
 * period (usually a minute)", lowered dynamically under system load, and the
 * same governance applies to GraphQL ("Rate limits apply to GraphQL calls";
 * "Can I use GraphQL to bypass rate limiting? No."). TTD authenticates a client
 * by the `TTD-Auth` token alone — REST and GraphQL alike — so the token is the
 * client identity this server can see. No number is published.
 *
 * So there is one bucket per TTD credential, shared by REST and GraphQL:
 *
 *   `ttd:client:{quotaClient}`
 *
 * The key this replaced, `ttd:${partnerId}`, was one bucket per PROCESS:
 * `partnerId` was a constant label (`direct-token` / `env-direct-token`), so
 * every HTTP tenant on an instance shared it and one tenant's bulk job queued
 * everyone else's for up to the limiter's queue budget (#237, ttd-REST #1).
 *
 * Deliberately coarser than TTD in one respect: TTD limits per client PER
 * ENDPOINT, and this bucket spans all endpoints of a client. Splitting it per
 * endpoint would multiply the per-client throughput by the number of endpoints
 * a workload touches, against a limit nobody has a number for — that is a
 * default change, not a keying fix, and is not made here.
 *
 * Two different tokens for the same TTD user are two keys. Whether TTD counts
 * per token or per user is not stated; resolving the user (`{ me { id } }`)
 * would cost an extra call in `validate()` whose shape is unverified here.
 */
export interface TtdQuotaScope {
  /** One-way hash of the session's TTD token — see `ttdQuotaClient`. */
  readonly quotaClient: string;
}

/**
 * Take `tokens` from the scope's bucket, queueing as the limiter does. The key
 * MUST stay in step with {@link ttdQuotaBucket} — `ttd-rate-limit-keys.test.ts`
 * asserts they do. A template literal (not a shared key builder) so the fleet
 * ratchet in `scripts/lib/rate-limit-keys.test.mjs` can see the `ttd:` prefix.
 */
export async function consumeTtdQuota(
  rateLimiter: RateLimiter,
  scope: TtdQuotaScope,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`ttd:client:${scope.quotaClient}`, tokens);
}

/**
 * The bucket {@link consumeTtdQuota} draws on, for the bulk capacity
 * projection: `costPerItem` has one entry per `consume` an item makes.
 */
export function ttdQuotaBucket(
  scope: TtdQuotaScope,
  costPerItem: readonly number[]
): BulkCapacityBucket {
  return { key: `ttd:client:${scope.quotaClient}`, costPerItem };
}
