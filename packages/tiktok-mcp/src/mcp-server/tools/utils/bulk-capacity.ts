// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for TikTok's batch tools.
 *
 * `consume` queues instead of failing, so a batch larger than the rate window
 * no longer breaks half-way — it runs for minutes, past client (~60s) and Cloud
 * Run (300s) timeouts. Each per-item bulk tool projects its whole batch against
 * the limiter BEFORE the confirmation prompt and the first upstream call, and
 * refuses it (with how many items fit) when the last request would queue past
 * the limit's `maxWaitMs`. The dry-run runs the same projection so it predicts
 * the refusal.
 *
 * The limiter is the process singleton from `utils/platform.ts` — the one
 * `createSessionServices` hands every `TikTokService` (index.ts, the HTTP
 * transport), so the projection reads the same window the writes will consume.
 *
 * Not covered, deliberately: `tiktok_bulk_update_status` and
 * `tiktok_delete_entity` send every id in ONE `{entity}/status/update/` request
 * (`updateEntityStatus`, a single 3-token consume), so their cost does not
 * grow with the batch.
 */

import { assertBulkCapacity, McpError } from "@cesteral/shared";
import type {
  BulkCapacityBucket,
  BulkCapacityResult,
  DryRunValidationError,
} from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";
import {
  TIKTOK_READ_TOKENS,
  TIKTOK_WRITE_TOKENS,
} from "../../../services/tiktok/tiktok-service.js";

/** Dry-run validation error code for a batch the limiter cannot admit within budget. */
export const BULK_EXCEEDS_CAPACITY = "BULK_EXCEEDS_CAPACITY";

/** Per-item consume pattern of each TikTok bulk tool. Every call uses `tiktok:default`. */
export const tiktokBulkBuckets = {
  /**
   * `tiktok_adjust_bids`: `TikTokService.adjustBids`, sequential per ad group —
   * `getEntity` (1) then `updateEntity` (3).
   */
  adjustBids: (): BulkCapacityBucket[] => [
    { key: "tiktok:default", costPerItem: [TIKTOK_READ_TOKENS, TIKTOK_WRITE_TOKENS] },
  ],
  /** `tiktok_bulk_create_entities`: one `createEntity` (3) per item. */
  bulkCreate: (): BulkCapacityBucket[] => [
    { key: "tiktok:default", costPerItem: [TIKTOK_WRITE_TOKENS] },
  ],
  /** `tiktok_bulk_update_entities`: one `updateEntity` (3) per item. */
  bulkUpdate: (): BulkCapacityBucket[] => [
    { key: "tiktok:default", costPerItem: [TIKTOK_WRITE_TOKENS] },
  ],
};

/**
 * Throw `RateLimited` (reason `bulk_exceeds_capacity`, with `itemsThatFit`)
 * when the batch cannot be admitted within the limit's queue budget.
 */
export function assertTikTokBulkCapacity(
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
export function tiktokBulkCapacityDryRunErrors(
  toolName: string,
  itemCount: number,
  buckets: readonly BulkCapacityBucket[],
  field: string
): DryRunValidationError[] {
  try {
    assertTikTokBulkCapacity(toolName, itemCount, buckets);
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
