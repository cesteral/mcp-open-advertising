// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for Snapchat's batch tools.
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
 * `createSessionServices` hands every `SnapchatService` (index.ts, the HTTP
 * transport), so the projection reads the same window the calls will consume.
 * Every Snapchat entity call consumes `snapchat:default`.
 *
 * Per-item cost includes the ownership reads: every `getEntity` walks the
 * parent chain to check the bound ad account (see `getEntityWorstCaseConsumes`).
 *
 * Not covered, deliberately: `snapchat_bulk_create_entities` sends the whole
 * batch in ONE create POST (one 3-token consume, plus one parent ownership read
 * for adGroup/ad), so its cost does not grow with the batch.
 */

import {
  assertBulkCapacity,
  projectBulkCapacity,
  McpError,
  JsonRpcErrorCode,
} from "@cesteral/shared";
import type { BulkCapacityResult, DryRunValidationError } from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";
import {
  SNAPCHAT_READ_TOKENS,
  SNAPCHAT_WRITE_TOKENS,
  getEntityWorstCaseConsumes,
} from "../../../services/snapchat/snapchat-service.js";
import type { SnapchatEntityType } from "./entity-mapping.js";

/** Dry-run validation error code for a batch the limiter cannot admit within budget. */
export const BULK_EXCEEDS_CAPACITY = "BULK_EXCEEDS_CAPACITY";

const KEY = "snapchat:default";

/**
 * A batch's consume pattern on `snapchat:default`: `leading` is paid once per
 * batch before any per-item consume; `perItem` is paid by every item, in order.
 */
export interface SnapchatBulkCostModel {
  leading: readonly number[];
  perItem: readonly number[];
}

/** Consume pattern of each Snapchat bulk tool (`SnapchatService`, snapchat-service.ts). */
export const snapchatBulkCost = {
  /**
   * `snapchat_bulk_update_entities` / `snapchat_bulk_update_status`
   * (`bulkUpdateEntities`): one 3-token consume for the single collection PUT,
   * taken FIRST, then a `getEntity` per item (`buildMergedUpdateItem`, run
   * concurrently) including its ownership walk.
   */
  bulkUpdate: (entityType: string): SnapchatBulkCostModel => ({
    leading: [SNAPCHAT_WRITE_TOKENS],
    perItem: getEntityWorstCaseConsumes(entityType as SnapchatEntityType),
  }),
  /**
   * `snapchat_delete_entity` (`deleteEntity` per id, concurrently): the
   * ownership pre-read `getEntity` then the 3-token DELETE.
   */
  delete: (entityType: string): SnapchatBulkCostModel => ({
    leading: [],
    perItem: [
      ...getEntityWorstCaseConsumes(entityType as SnapchatEntityType),
      SNAPCHAT_WRITE_TOKENS,
    ],
  }),
  /**
   * `snapchat_adjust_bids` (`adjustBids`, sequential per ad squad): read the
   * ad squad (`getEntity`, walking to its campaign), then `updateEntity` — the
   * 3-token consume, then `buildMergedUpdateItem` re-reads the ad squad, whose
   * campaign is now memoized, so that read is its own GET only.
   */
  adjustBids: (): SnapchatBulkCostModel => ({
    leading: [],
    perItem: [
      ...getEntityWorstCaseConsumes("adGroup"),
      SNAPCHAT_WRITE_TOKENS,
      SNAPCHAT_READ_TOKENS,
    ],
  }),
};

function sequenceFor(model: SnapchatBulkCostModel, items: number): number[] {
  const costs = [...model.leading];
  for (let i = 0; i < items; i++) costs.push(...model.perItem);
  return costs;
}

/**
 * Project the batch as ONE sequence (leading consumes, then every item's) —
 * `projectBulkCapacity` has no notion of a per-batch cost, so the batch is
 * modeled as a single chunk and "items that fit" is the largest prefix whose
 * sequence still fits.
 */
function project(
  toolName: string,
  itemCount: number,
  model: SnapchatBulkCostModel
): BulkCapacityResult {
  if (model.leading.length === 0) {
    return projectBulkCapacity({
      rateLimiter,
      toolName,
      itemCount,
      buckets: [{ key: KEY, costPerItem: model.perItem }],
    });
  }
  const chunk = (items: number) =>
    projectBulkCapacity({
      rateLimiter,
      toolName,
      itemCount: 1,
      buckets: [{ key: KEY, costPerItem: sequenceFor(model, items) }],
    });
  const full = chunk(itemCount);
  let itemsThatFit = itemCount;
  if (full.itemsThatFit < 1) {
    itemsThatFit = 0;
    for (let k = itemCount - 1; k >= 1; k--) {
      if (chunk(k).itemsThatFit >= 1) {
        itemsThatFit = k;
        break;
      }
    }
  }
  return { itemsThatFit, projectedWaitMs: full.projectedWaitMs, budgetMs: full.budgetMs };
}

/**
 * Throw `RateLimited` (reason `bulk_exceeds_capacity`, with `itemsThatFit`)
 * when the batch cannot be admitted within the limit's queue budget. Same
 * error shape and wording as `@cesteral/shared`'s `assertBulkCapacity`, which
 * is used directly when the model has no per-batch consume.
 */
export function assertSnapchatBulkCapacity(
  toolName: string,
  itemCount: number,
  model: SnapchatBulkCostModel
): BulkCapacityResult {
  if (model.leading.length === 0) {
    return assertBulkCapacity({
      rateLimiter,
      toolName,
      itemCount,
      buckets: [{ key: KEY, costPerItem: model.perItem }],
    });
  }

  const result = project(toolName, itemCount, model);
  if (result.itemsThatFit >= itemCount) return result;

  const finite = Number.isFinite(result.projectedWaitMs);
  const seconds = finite
    ? `${Math.ceil(result.projectedWaitMs / 1000)}s`
    : "never (an item costs more than the whole limit)";
  throw new McpError(
    JsonRpcErrorCode.RateLimited,
    `${toolName}: ${itemCount} items would take ${seconds} to clear the rate limit, ` +
      `more than the ${Math.ceil(result.budgetMs / 1000)}s budget, so nothing was sent. ` +
      `${result.itemsThatFit} item(s) fit right now — split the batch into chunks of at most ` +
      `${Math.max(result.itemsThatFit, 1)} and send them as capacity frees up.`,
    {
      reason: "bulk_exceeds_capacity",
      itemCount,
      itemsThatFit: result.itemsThatFit,
      projectedWaitMs: finite ? result.projectedWaitMs : null,
      budgetMs: result.budgetMs,
      retryAfterMs: finite ? Math.max(0, result.projectedWaitMs - result.budgetMs) : null,
    }
  );
}

/**
 * Dry-run parity: the validation error the execute path's refusal would
 * produce, carrying the same message (items that fit, projected wait), or
 * none when the batch fits.
 */
export function snapchatBulkCapacityDryRunErrors(
  toolName: string,
  itemCount: number,
  model: SnapchatBulkCostModel,
  field: string
): DryRunValidationError[] {
  try {
    assertSnapchatBulkCapacity(toolName, itemCount, model);
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
