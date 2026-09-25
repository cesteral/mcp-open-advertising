// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { BulkCapacityCheck, RateLimiter } from "@cesteral/shared";

/**
 * Bulk-capacity projection inputs for a DV360 batch, one per limiter key.
 *
 * Every DV360 call consumes one token from `dv360:${advertiserId}` — and only
 * when the call carries an advertiserId (DV360Service / TargetingService). A
 * batch whose items span several advertisers therefore draws from several
 * independent buckets, so the items are grouped by advertiser and each group is
 * projected on its own key with its own item count.
 *
 * `advertiserIds` holds one entry per item; an `undefined` entry (an id still
 * to be elicited, or a call that is not advertiser-scoped) consumes nothing
 * that can be projected and is left out, so the projection is a lower bound for
 * such items. It is also a lower bound for a SEQUENTIAL batch spanning several
 * advertisers, whose per-key waits add up rather than overlap.
 */
export function dv360BulkCapacityChecks(
  rateLimiter: RateLimiter,
  toolName: string,
  advertiserIds: ReadonlyArray<string | undefined>,
  costPerItem: readonly number[]
): BulkCapacityCheck[] {
  const counts = new Map<string, number>();
  for (const advertiserId of advertiserIds) {
    if (!advertiserId) continue;
    counts.set(advertiserId, (counts.get(advertiserId) ?? 0) + 1);
  }
  return [...counts].map(([advertiserId, itemCount]) => ({
    rateLimiter,
    toolName,
    itemCount,
    buckets: [{ key: `dv360:${advertiserId}`, costPerItem }],
  }));
}
