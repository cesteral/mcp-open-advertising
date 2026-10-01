// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { RateLimiter } from "@cesteral/shared";

/**
 * Rate-limit scope of a Snapchat session: the Snap user its token
 * authenticates (`user:{me.id}` from `GET /v1/me`, see
 * `snapchatQuotaPrincipal`).
 *
 * basis: Snap publishes no Ads API spec or SDK (the vendor-authored repos
 * cover only the Conversions API), so there is no primary source for how Snap
 * counts. Corroboration only (platform-facts `snapchat.rate_limit_default`, a
 * search snippet of developers.snap.com/api/marketing-api/Ads-API/rate-limits):
 * limits apply "at both App and Token level", about 20 requests/second per app
 * and 10 per access token, throttled with HTTP 429.
 *
 * So there are two buckets per Snap user:
 *
 *   `snapchat:{principal}`            entity CRUD, targeting, previews, the
 *                                     ad-account timezone read
 *   `snapchat:{principal}:reporting`  stats submit and polls
 *
 * Keyed by user rather than by token: under the refresh flow the access token
 * rotates about every 30 minutes, and a token-keyed bucket would reset at each
 * rotation. One user holding several tokens gets one bucket here and several
 * at Snap — stricter than the token-level limit, never looser.
 *
 * The keys these replaced, `snapchat:default` and `snapchat:reporting`, were
 * one bucket per PROCESS: every HTTP tenant on an instance shared them, so one
 * tenant's bulk job queued every other tenant's calls for up to the limiter's
 * queue budget and made the bulk capacity pre-check refuse their batches
 * (#237, snapchat #1 / cross-fleet #5; the ttd REST #1 fix `8f11eda` is the
 * precedent this follows).
 *
 * What this does NOT model: the corroborated app-level limit. Every tenant
 * whose token was issued to the same Snap app shares that app's bucket, and N
 * such tenants on one instance can now send N times the default where they
 * used to share it. The server cannot see which app issued a caller's token.
 * Snap's 429 still surfaces as RateLimited and is retried by the HTTP client.
 */
export interface SnapchatQuotaScope {
  /** `user:{snap user id}`, or `cred:{hash}` before validation — never a token. */
  readonly quotaPrincipal: string;
}

/**
 * Take `tokens` from the scope's entity bucket, queueing as the limiter does.
 * The key MUST stay in step with {@link snapchatQuotaKey} —
 * `snapchat-rate-limit-keys.test.ts` asserts they do. A template literal (not
 * a shared key builder) so the fleet ratchet in
 * `scripts/lib/rate-limit-keys.test.mjs` can see the `snapchat:` prefix.
 */
export async function consumeSnapchatQuota(
  rateLimiter: RateLimiter,
  scope: SnapchatQuotaScope,
  tokens: number = 1
): Promise<void> {
  await rateLimiter.consume(`snapchat:${scope.quotaPrincipal}`, tokens);
}

/** Take one token from the scope's reporting bucket. */
export async function consumeSnapchatReportingQuota(
  rateLimiter: RateLimiter,
  scope: SnapchatQuotaScope
): Promise<void> {
  await rateLimiter.consume(`snapchat:${scope.quotaPrincipal}:reporting`);
}

/** The entity bucket {@link consumeSnapchatQuota} draws on, for the bulk capacity projection. */
export function snapchatQuotaKey(scope: SnapchatQuotaScope): string {
  return `snapchat:${scope.quotaPrincipal}`;
}

/** The reporting bucket {@link consumeSnapchatReportingQuota} draws on. */
export function snapchatReportingQuotaKey(scope: SnapchatQuotaScope): string {
  return `snapchat:${scope.quotaPrincipal}:reporting`;
}
