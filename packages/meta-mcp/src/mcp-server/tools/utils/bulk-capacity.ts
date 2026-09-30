// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for Meta's batch tools.
 *
 * `consume` queues instead of failing, so a batch larger than the rate window
 * no longer breaks half-way — it runs for minutes, past client (~60s) and Cloud
 * Run (300s) timeouts. Each bulk tool projects its whole batch against the
 * limiter BEFORE the confirmation prompt and the first upstream call, and
 * refuses it (with how many items fit) when the last request would queue past
 * the limit's `maxWaitMs`. The dry-run runs the same projection so it predicts
 * the refusal.
 *
 * The limiter is the process singleton from `utils/platform.ts` — the one
 * `createSessionServices` hands every `MetaService` (index.ts, the HTTP
 * transport), so the projection reads the same window the writes will consume.
 *
 * Every bucket below mirrors the `consume` calls the tool's service path makes
 * per item, in order — keys exactly as passed to `consume`, costs from the
 * service's exported token constants.
 */

import { assertBulkCapacity, McpError } from "@cesteral/shared";
import type {
  BulkCapacityBucket,
  BulkCapacityResult,
  DryRunValidationError,
} from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";
import { META_READ_TOKENS, META_WRITE_TOKENS } from "../../../services/meta/meta-service.js";

/** Dry-run validation error code for a batch the limiter cannot admit within budget. */
export const BULK_EXCEEDS_CAPACITY = "BULK_EXCEEDS_CAPACITY";

/** Per-item consume pattern of each Meta bulk tool. */
export const metaBulkBuckets = {
  /**
   * `meta_adjust_bids`: sequential per ad set — `getEntity` (meta-service.ts,
   * `meta:default`, 1) then `updateEntity` (`meta:default`, 3).
   */
  adjustBids: (): BulkCapacityBucket[] => [
    { key: "meta:default", costPerItem: [META_READ_TOKENS, META_WRITE_TOKENS] },
  ],
  /**
   * `meta_bulk_create_entities`: one `createEntity` per item, keyed by the
   * `adAccountId` exactly as the tool passes it (not normalized to `act_`).
   */
  bulkCreate: (adAccountId: string): BulkCapacityBucket[] => [
    { key: `meta:${adAccountId}`, costPerItem: [META_WRITE_TOKENS] },
  ],
  /**
   * `meta_bulk_update_entities` / `meta_bulk_update_status`: one `updateEntity`
   * (POST /{id}) per item on `meta:default`.
   */
  bulkUpdate: (): BulkCapacityBucket[] => [
    { key: "meta:default", costPerItem: [META_WRITE_TOKENS] },
  ],
};

/**
 * Throw `RateLimited` (reason `bulk_exceeds_capacity`, with `itemsThatFit`)
 * when the batch cannot be admitted within the limit's queue budget.
 */
export function assertMetaBulkCapacity(
  toolName: string,
  itemCount: number,
  buckets: readonly BulkCapacityBucket[]
): BulkCapacityResult {
  return assertBulkCapacity({ rateLimiter, toolName, itemCount, buckets });
}

/**
 * Dry-run parity: the validation error the execute path's refusal would
 * produce, carrying the same message (items that fit, projected wait), or
 * none when the batch fits.
 */
export function metaBulkCapacityDryRunErrors(
  toolName: string,
  itemCount: number,
  buckets: readonly BulkCapacityBucket[],
  field: string
): DryRunValidationError[] {
  try {
    assertMetaBulkCapacity(toolName, itemCount, buckets);
    return [];
  } catch (error) {
    if (
      error instanceof McpError &&
      (error.data as { reason?: unknown } | undefined)?.reason === "bulk_exceeds_capacity"
    ) {
      return [{ code: BULK_EXCEEDS_CAPACITY, message: error.message, field }];
    }
    throw error;
  }
}
