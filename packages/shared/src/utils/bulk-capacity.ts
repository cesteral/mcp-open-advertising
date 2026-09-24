// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check.
 *
 * Rate-limited calls queue (see rate-limiter.ts) instead of failing, which
 * fixed half-applied batches but moved the failure somewhere worse: at the
 * fleet's default limits a 50-item bulk job can queue for 8–19 minutes, far
 * past MCP client timeouts (~60s) and Cloud Run's default request timeout
 * (300s). The client gives up, the server keeps writing, and nobody sees the
 * result.
 *
 * `assertBulkCapacity` projects the whole batch against the limiter BEFORE the
 * first write (and before any confirmation prompt) and refuses it when the last
 * request would be admitted later than the budget — with how many items fit
 * now, so the caller can split the batch instead of guessing.
 *
 * The budget defaults to the limit's own `maxWaitMs`: a batch may take as long
 * to admit as a single call is allowed to queue, and no longer.
 */

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";
import type { RateLimiter } from "./rate-limiter.js";

export interface BulkCapacityBucket {
  /** The limiter key the items consume from, exactly as the service passes it to `consume`. */
  key: string;
  /**
   * Token cost of every `consume` call ONE item makes on this key, in order —
   * e.g. `[1, 3]` for a read (1 token) followed by a write (3 tokens).
   */
  costPerItem: readonly number[];
}

export interface BulkCapacityCheck {
  rateLimiter: RateLimiter;
  /** Tool name, for the error message. */
  toolName: string;
  itemCount: number;
  /**
   * Every limiter bucket the items draw from. Most tools use one; a tool that
   * reads and writes through different keys lists both. A batch must fit in
   * every bucket.
   */
  buckets: readonly BulkCapacityBucket[];
  /**
   * Latest acceptable admission offset for the batch's final request, in ms.
   * Defaults to the matched limit's `maxWaitMs`.
   */
  maxProjectedWaitMs?: number;
}

export interface BulkCapacityResult {
  /** Items whose every request is admitted within budget (on every bucket). */
  itemsThatFit: number;
  /** Projected ms from now until the final request of the batch is admitted. */
  projectedWaitMs: number;
  budgetMs: number;
}

/**
 * Project the batch and report how much of it fits. Pure — reserves nothing.
 * Buckets with no configured limit never constrain the batch.
 */
export function projectBulkCapacity(check: BulkCapacityCheck): BulkCapacityResult {
  let itemsThatFit = check.itemCount;
  let projectedWaitMs = 0;
  let budgetMs = check.maxProjectedWaitMs ?? Infinity;

  for (const bucket of check.buckets) {
    const perItem = bucket.costPerItem.length;
    if (perItem === 0 || check.itemCount === 0) continue;

    const costs: number[] = [];
    for (let i = 0; i < check.itemCount; i++) costs.push(...bucket.costPerItem);

    const projection = check.rateLimiter.projectAdmissions(bucket.key, costs);
    if (!projection.configured) continue;

    const bucketBudget = check.maxProjectedWaitMs ?? projection.maxWaitMs;
    budgetMs = Math.min(budgetMs, bucketBudget);

    const offsets = projection.admissionOffsetsMs;
    projectedWaitMs = Math.max(projectedWaitMs, offsets[offsets.length - 1] ?? 0);

    // An item fits when its LAST request on this bucket is admitted in budget.
    let fit = 0;
    while (fit < check.itemCount && offsets[(fit + 1) * perItem - 1]! <= bucketBudget) fit++;
    itemsThatFit = Math.min(itemsThatFit, fit);
  }

  return {
    itemsThatFit,
    projectedWaitMs,
    budgetMs: Number.isFinite(budgetMs) ? budgetMs : 0,
  };
}

/**
 * Throw `RateLimited` before any write when the batch cannot be admitted within
 * budget. The error carries `itemsThatFit` and `retryAfterMs` so the caller can
 * split the batch or wait.
 */
export function assertBulkCapacity(check: BulkCapacityCheck): BulkCapacityResult {
  const result = projectBulkCapacity(check);
  if (result.itemsThatFit >= check.itemCount) return result;

  const seconds = Number.isFinite(result.projectedWaitMs)
    ? `${Math.ceil(result.projectedWaitMs / 1000)}s`
    : "never (an item costs more than the whole limit)";
  throw new McpError(
    JsonRpcErrorCode.RateLimited,
    `${check.toolName}: ${check.itemCount} items would take ${seconds} to clear the rate limit, ` +
      `more than the ${Math.ceil(result.budgetMs / 1000)}s budget, so nothing was sent. ` +
      `${result.itemsThatFit} item(s) fit right now — split the batch into chunks of at most ` +
      `${Math.max(result.itemsThatFit, 1)} and send them as capacity frees up.`,
    {
      reason: "bulk_exceeds_capacity",
      itemCount: check.itemCount,
      itemsThatFit: result.itemsThatFit,
      projectedWaitMs: Number.isFinite(result.projectedWaitMs) ? result.projectedWaitMs : null,
      budgetMs: result.budgetMs,
      retryAfterMs: Number.isFinite(result.projectedWaitMs)
        ? Math.max(0, result.projectedWaitMs - result.budgetMs)
        : null,
    }
  );
}
