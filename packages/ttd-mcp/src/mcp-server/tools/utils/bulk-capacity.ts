// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check helpers for this package's batch tools.
 *
 * Rate-limited calls queue instead of failing, so a batch larger than the
 * limiter can admit within its queue budget no longer breaks half-way — it runs
 * for minutes, past client and Cloud Run request timeouts. Batch tools refuse
 * such a batch BEFORE any confirmation prompt or upstream call:
 *
 * - execute: `assertBulkCapacityAll` throws `RateLimited` (data.reason
 *   `bulk_exceeds_capacity`, with `itemsThatFit` / `retryAfterMs`);
 * - dry run: `bulkCapacityDryRunErrors` reports the same refusal as a
 *   `BULK_EXCEEDS_CAPACITY` validation error, so the preview predicts it.
 *
 * A tool whose items hit more than one limiter key passes one check per key.
 */

import { assertBulkCapacity, projectBulkCapacity } from "@cesteral/shared";
import type { BulkCapacityCheck, DryRunValidationError } from "@cesteral/shared";

export const BULK_EXCEEDS_CAPACITY = "BULK_EXCEEDS_CAPACITY";

/** Throw before any write when any check's batch cannot be admitted within budget. */
export function assertBulkCapacityAll(checks: readonly BulkCapacityCheck[]): void {
  for (const check of checks) assertBulkCapacity(check);
}

/**
 * Dry-run parity for {@link assertBulkCapacityAll}: one `BULK_EXCEEDS_CAPACITY`
 * validation error per check the execute path would refuse. Reserves nothing.
 */
export function bulkCapacityDryRunErrors(
  checks: readonly BulkCapacityCheck[]
): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];
  for (const check of checks) {
    const projection = projectBulkCapacity(check);
    if (projection.itemsThatFit >= check.itemCount) continue;
    const seconds = Number.isFinite(projection.projectedWaitMs)
      ? `${Math.ceil(projection.projectedWaitMs / 1000)}s`
      : "never (an item costs more than the whole limit)";
    errors.push({
      code: BULK_EXCEEDS_CAPACITY,
      message:
        `${check.toolName}: ${check.itemCount} items would take ${seconds} to clear the rate limit, ` +
        `more than the ${Math.ceil(projection.budgetMs / 1000)}s budget, so the batch would be ` +
        `refused before anything is sent. ${projection.itemsThatFit} item(s) fit right now — split ` +
        `the batch into chunks of at most ${Math.max(projection.itemsThatFit, 1)}.`,
    });
  }
  return errors;
}
