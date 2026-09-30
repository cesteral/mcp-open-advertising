// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for Amazon DSP bulk tools.
 *
 * `consume` queues instead of failing, so a batch that does not fit the
 * limiter's window runs for minutes — past client and Cloud Run timeouts. Each
 * bulk tool projects its batch against the package's live limiter BEFORE the
 * confirmation prompt and the first upstream call, and refuses it with the
 * number of items that fit (see `@cesteral/shared` bulk-capacity.ts).
 *
 * The buckets below restate, per item, the `consume` calls AmazonDspService
 * makes — keep them in step with amazon-dsp-service.ts:
 *   - getEntity                          → consume("amazon_dsp:read")       (1 token)
 *   - createEntity / updateEntity /
 *     updateEntityStatus / deleteEntity  → consume("amazon_dsp:write", 3)   (3 tokens)
 * Reads and writes are separate limiter keys (separate windows), so a tool
 * that does both lists two buckets.
 */

import { assertBulkCapacity, projectBulkCapacity } from "@cesteral/shared";
import type {
  BulkCapacityBucket,
  BulkCapacityResult,
  DryRunValidationError,
  EffectDryRunResult,
} from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";

export const AMAZON_DSP_READ_KEY = "amazon_dsp:read";
export const AMAZON_DSP_WRITE_KEY = "amazon_dsp:write";

/** One write (create / update / status PUT / archive PUT) per item. */
export const ONE_WRITE_PER_ITEM: readonly BulkCapacityBucket[] = [
  { key: AMAZON_DSP_WRITE_KEY, costPerItem: [3] },
];

/** adjust_bids: read the line item, then write it back — per item. */
export const READ_THEN_WRITE_PER_ITEM: readonly BulkCapacityBucket[] = [
  { key: AMAZON_DSP_READ_KEY, costPerItem: [1] },
  { key: AMAZON_DSP_WRITE_KEY, costPerItem: [3] },
];

/**
 * Throw `RateLimited` (reason `bulk_exceeds_capacity`) when the batch cannot
 * be admitted within the limiter's queue budget. Call on the execute path
 * after input validation and before any confirmation prompt or upstream call.
 */
export function assertAmazonDspBulkCapacity(
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
      `${itemCount} items would take ${wait} to clear the Amazon DSP rate limit, more than the ` +
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
