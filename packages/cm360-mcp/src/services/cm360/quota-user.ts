// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { fingerprintCredentials } from "@cesteral/shared";

/**
 * The rate-limit identity of a CM360 session: who Google counts the per-user
 * quota against.
 *
 * CM360 quotas are per user (and per project), not per user profile — one
 * Google principal can hold a profile in several CM360 accounts, and all of
 * them draw on the same allowance (platform-facts `cm360.rate_limit_default`).
 * Keying the limiter per profile let such a user run several times the
 * default. The principal is the authenticated credential: a service account
 * or one OAuth refresh-token grant. Two refresh tokens for the same human are
 * two keys — the adapter holds no user identity, and resolving one would cost
 * an extra upstream call per session.
 *
 * Derived from the session-binding fingerprint by a second one-way hash, so the
 * binding value itself never appears in a limiter key (rate-limit errors echo
 * the key). Sessions with no fingerprint share one `unidentified` key — the
 * conservative fallback, identical to the old shared bucket.
 */
export function cm360QuotaUser(credentialFingerprint: string | undefined): string {
  if (!credentialFingerprint) return "unidentified";
  return fingerprintCredentials("cm360-quota-user", credentialFingerprint).slice(0, 16);
}
