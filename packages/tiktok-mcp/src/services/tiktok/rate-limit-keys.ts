// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { BulkCapacityBucket, RateLimiter } from "@cesteral/shared";

/**
 * Rate-limit scope of a TikTok session: the access token its calls are sent
 * with (`Access-Token` header).
 *
 * basis: TikTok publishes no per-tenant counting rule this repo can read. The
 * official SDK (tiktok/tiktok-business-api-sdk @ f809c39,
 * `python_sdk/business_api_client/tiktok_business/tiktok_code.py`) defines the
 * throttle codes 40100 REQUEST_TOO_FREQUENT and 40132
 * REQUEST_FREQUENCY_LIMITED but no quota or scope. Corroboration only
 * (platform-facts `tiktok.rate_limit_default`): third-party mirrors of the
 * rate-limit page say limits are per developer app, with some per-endpoint
 * caps (`report/task/create/` 60 QPM).
 *
 * So there are two buckets per TikTok access token:
 *
 *   `tiktok:token:{quotaClient}`            CRUD, targeting, audience estimate
 *   `tiktok:token:{quotaClient}:reporting`  report task create/check/download
 *                                           and the synchronous report pages
 *
 * The keys these replaced, `tiktok:default` and `tiktok:reporting`, were one
 * bucket per PROCESS: every HTTP tenant on an instance shared them, so one
 * tenant's bulk job queued every other tenant's calls for up to the limiter's
 * queue budget and made the bulk capacity pre-check refuse their batches
 * (#237, cross-fleet #5; the ttd REST #1 fix `8f11eda` is the
 * precedent this follows).
 *
 * What this does NOT model: if the corroborated per-app quota is right, every
 * tenant whose token was issued to the same developer app shares ONE TikTok
 * bucket, and N such tenants on an instance can now send N times the default
 * where they used to share it. The server cannot see which app issued a token
 * (no SDK endpoint maps a token to its app without the app secret). The
 * per-token key isolates tenants from each other's queues; it does not claim
 * the platform counts per token. A 40100/40132 still surfaces as RateLimited
 * (`tiktok-http-client.ts`).
 *
 * The advertiser id is deliberately NOT part of the key: it is a
 * caller-supplied header, so keying on it would let a caller choose a fresh
 * bucket by naming another advertiser.
 */
export interface TikTokQuotaScope {
  /** One-way hash of the session's access token — see `tiktokQuotaClient`. */
  readonly quotaClient: string;
}

/**
 * Take `tokens` from the scope's CRUD bucket, queueing as the limiter does.
 * The key MUST stay in step with {@link tiktokQuotaBucket} —
 * `tiktok-rate-limit-keys.test.ts` asserts they do. A template literal (not a
 * shared key builder) so the fleet ratchet in `scripts/lib/rate-limit-keys.test.mjs`
 * can see the `tiktok:` prefix.
 */
export async function consumeTikTokQuota(
  rateLimiter: RateLimiter,
  scope: TikTokQuotaScope,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`tiktok:token:${scope.quotaClient}`, tokens);
}

/** Take one token from the scope's reporting bucket. */
export async function consumeTikTokReportingQuota(
  rateLimiter: RateLimiter,
  scope: TikTokQuotaScope
): Promise<void> {
  await rateLimiter.consume(`tiktok:token:${scope.quotaClient}:reporting`);
}

/**
 * The CRUD bucket {@link consumeTikTokQuota} draws on, for the bulk capacity
 * projection: `costPerItem` has one entry per `consume` an item makes.
 */
export function tiktokQuotaBucket(
  scope: TikTokQuotaScope,
  costPerItem: readonly number[]
): BulkCapacityBucket {
  return { key: `tiktok:token:${scope.quotaClient}`, costPerItem };
}

/** The reporting bucket {@link consumeTikTokReportingQuota} draws on. */
export function tiktokReportingQuotaKey(scope: TikTokQuotaScope): string {
  return `tiktok:token:${scope.quotaClient}:reporting`;
}
