// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for Pinterest's batch tools.
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
 * `createSessionServices` hands every `PinterestService` (index.ts, the HTTP
 * transport), so the projection reads the same window the writes will consume.
 *
 * Every write here draws on the session's bucket for the ad account the tool
 * passes as `filters.adAccountId` — `pinterestAccountQuotaBucket`, the same
 * key `consumePinterestAccountQuota` consumes (`rate-limit-keys.ts`). The
 * buckets are the SESSION's (its Pinterest user's), so a tool resolves its
 * session before projecting — on the dry run too — and another tenant's
 * traffic neither fills them nor gets this batch refused.
 */

import { assertBulkCapacity, McpError } from "@cesteral/shared";
import type {
  BulkCapacityBucket,
  BulkCapacityResult,
  DryRunValidationError,
} from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";
import {
  PINTEREST_READ_TOKENS,
  PINTEREST_WRITE_TOKENS,
} from "../../../services/pinterest/pinterest-service.js";
import {
  pinterestAccountQuotaBucket,
  type PinterestQuotaScope,
} from "../../../services/pinterest/rate-limit-keys.js";

/** Dry-run validation error code for a batch the limiter cannot admit within budget. */
export const BULK_EXCEEDS_CAPACITY = "BULK_EXCEEDS_CAPACITY";

/** Per-item consume pattern of each Pinterest bulk tool. */
export const pinterestBulkBuckets = {
  /**
   * `pinterest_adjust_bids`: `PinterestService.adjustBids`, sequential per ad
   * group — `getEntity` (1) then `updateEntity` (3).
   */
  adjustBids: (scope: PinterestQuotaScope, adAccountId: string): BulkCapacityBucket[] => [
    pinterestAccountQuotaBucket(scope, adAccountId, [
      PINTEREST_READ_TOKENS,
      PINTEREST_WRITE_TOKENS,
    ]),
  ],
  /**
   * `pinterest_bulk_create_entities` / `_bulk_update_entities` /
   * `_bulk_update_status`: one `createEntity` / `updateEntity` (3) per item —
   * the batch endpoints are called with a one-item array each.
   */
  perItemWrite: (scope: PinterestQuotaScope, adAccountId: string): BulkCapacityBucket[] => [
    pinterestAccountQuotaBucket(scope, adAccountId, [PINTEREST_WRITE_TOKENS]),
  ],
  /**
   * `pinterest_delete_entity`: campaign / adGroup / ad are archived with one
   * `updateEntity` (3) per id; a creative (Pin) is removed with one
   * `DELETE /v5/pins/{pin_id}` (3) per id (`deleteEntity`). Either way one
   * write per item — a multi-Pin delete used to draw a single write for the
   * whole batch and project nothing (#236).
   */
  delete: (scope: PinterestQuotaScope, adAccountId: string): BulkCapacityBucket[] => [
    pinterestAccountQuotaBucket(scope, adAccountId, [PINTEREST_WRITE_TOKENS]),
  ],
};

/**
 * Throw `RateLimited` (reason `bulk_exceeds_capacity`, with `itemsThatFit`)
 * when the batch cannot be admitted within the limit's queue budget.
 */
export function assertPinterestBulkCapacity(
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
export function pinterestBulkCapacityDryRunErrors(
  toolName: string,
  itemCount: number,
  buckets: readonly BulkCapacityBucket[],
  field: string
): DryRunValidationError[] {
  try {
    assertPinterestBulkCapacity(toolName, itemCount, buckets);
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
