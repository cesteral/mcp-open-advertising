// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for LinkedIn bulk tools.
 *
 * `consume` queues instead of failing, so a batch that does not fit the
 * limiter's window runs for minutes — past client and Cloud Run timeouts. Each
 * bulk tool projects its batch against the package's live limiter BEFORE the
 * confirmation prompt and the first upstream call, and refuses it with the
 * number of items that fit (see `@cesteral/shared` bulk-capacity.ts).
 *
 * The buckets below restate, per item, the `consume` calls LinkedInService
 * makes — keep them in step with linkedin-service.ts / linkedin-reporting-service.ts:
 *   - createEntity / updateEntity / deleteEntity → consume(`linkedin:default`, 3)
 *   - reporting getAnalytics (once per pivot)    → consume(`linkedin:${adAccountUrn}`)
 * Every entity write shares the single `linkedin:default` key.
 */

import { assertBulkCapacity, projectBulkCapacity } from "@cesteral/shared";
import type {
  BulkCapacityBucket,
  BulkCapacityResult,
  DryRunValidationError,
  EffectDryRunResult,
} from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";

export const LINKEDIN_ENTITY_KEY = "linkedin:default";

/** One 3-token entity write (create / PATCH) per item. */
export const ONE_WRITE_PER_ITEM: readonly BulkCapacityBucket[] = [
  { key: LINKEDIN_ENTITY_KEY, costPerItem: [3] },
];

/** get_analytics_breakdowns: one 1-token analytics read per pivot, on the account's key. */
export function analyticsReadPerPivot(adAccountUrn: string): readonly BulkCapacityBucket[] {
  return [{ key: `linkedin:${adAccountUrn}`, costPerItem: [1] }];
}

/**
 * Throw `RateLimited` (reason `bulk_exceeds_capacity`) when the batch cannot
 * be admitted within the limiter's queue budget. Call on the execute path
 * after input validation and before any confirmation prompt or upstream call.
 */
export function assertLinkedInBulkCapacity(
  toolName: string,
  itemCount: number,
  buckets: readonly BulkCapacityBucket[]
): BulkCapacityResult {
  return assertBulkCapacity({ rateLimiter, toolName, itemCount, buckets });
}

/**
 * Dry-run parity: the `BULK_EXCEEDS_CAPACITY` validation error the execute
 * path would refuse with, or `undefined` when the batch fits.
 */
export function bulkCapacityDryRunError(
  toolName: string,
  itemCount: number,
  buckets: readonly BulkCapacityBucket[],
  field: string
): DryRunValidationError | undefined {
  const projection = projectBulkCapacity({ rateLimiter, toolName, itemCount, buckets });
  if (projection.itemsThatFit >= itemCount) return undefined;
  const wait = Number.isFinite(projection.projectedWaitMs)
    ? `${Math.ceil(projection.projectedWaitMs / 1000)}s`
    : "never (an item costs more than the whole limit)";
  return {
    code: "BULK_EXCEEDS_CAPACITY",
    message:
      `${itemCount} items would take ${wait} to clear the LinkedIn rate limit, more than the ` +
      `${Math.ceil(projection.budgetMs / 1000)}s budget, so the call would be refused before any ` +
      `write. ${projection.itemsThatFit} item(s) fit right now — split the batch into chunks of ` +
      `at most ${Math.max(projection.itemsThatFit, 1)}.`,
    field,
  };
}

/** Fold a capacity refusal into an effect dry-run result (no-op when it fits). */
export function withBulkCapacityError(
  dryRun: EffectDryRunResult,
  error: DryRunValidationError | undefined
): EffectDryRunResult {
  if (!error) return dryRun;
  return {
    ...dryRun,
    wouldSucceed: false,
    validationErrors: [...dryRun.validationErrors, error],
  };
}
