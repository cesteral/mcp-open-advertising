// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for Microsoft Ads bulk tools.
 *
 * `consume` queues instead of failing, so a batch that does not fit the
 * limiter's window runs for minutes — past client and Cloud Run timeouts. Each
 * bulk tool projects its batch against the package's live limiter BEFORE the
 * confirmation prompt and the first upstream call, and refuses it with the
 * number of items that fit (see `@cesteral/shared` bulk-capacity.ts).
 *
 * The costs below restate the quota MsAdsService consumes — keep them in step
 * with msads-service.ts. Every request draws on BOTH of the session's write
 * buckets (per user and per customer, `msadsQuotaBuckets`), and a batch fits
 * only if it clears both:
 *   - bulkCreateEntities / bulkUpdateEntities: ONE 3-token write per CHUNK of
 *     `batchLimit` items (entity-mapping.ts), not per item. The projection
 *     therefore runs over chunks, and the refusal reports items that fit as
 *     whole chunks × `batchLimit`.
 *   - bulkUpdateStatus: one 1-token write per entity id.
 */

import {
  assertBulkCapacity,
  projectBulkCapacity,
  McpError,
  JsonRpcErrorCode,
} from "@cesteral/shared";
import type {
  BulkCapacityBucket,
  BulkCapacityResult,
  DryRunValidationError,
  EffectDryRunResult,
} from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";
import {
  msadsQuotaBuckets,
  type MsAdsQuotaScope,
} from "../../../services/msads/rate-limit-keys.js";
import { getEntityConfig, type MsAdsEntityType } from "./entity-mapping.js";

/** One 3-token Add/Update request per chunk of `batchLimit` items. */
function oneWritePerChunk(scope: MsAdsQuotaScope): readonly BulkCapacityBucket[] {
  return msadsQuotaBuckets(scope, "write", [3]);
}

/** bulk_update_status: one 1-token status Update per entity id. */
export function oneStatusWritePerItem(scope: MsAdsQuotaScope): readonly BulkCapacityBucket[] {
  return msadsQuotaBuckets(scope, "write", [1]);
}

/** A per-item batch: throw `RateLimited` (reason `bulk_exceeds_capacity`) when it cannot be admitted in time. */
export function assertMsAdsBulkCapacity(
  toolName: string,
  itemCount: number,
  buckets: readonly BulkCapacityBucket[]
): BulkCapacityResult {
  return assertBulkCapacity({ rateLimiter, toolName, itemCount, buckets });
}

interface ChunkedProjection {
  itemCount: number;
  chunkSize: number;
  chunkCount: number;
  chunksThatFit: number;
  /** Whole chunks that fit, in items (never more than `itemCount`). */
  itemsThatFit: number;
  projectedWaitMs: number;
  budgetMs: number;
}

function projectChunked(
  scope: MsAdsQuotaScope,
  entityType: string,
  itemCount: number
): ChunkedProjection {
  const chunkSize = getEntityConfig(entityType as MsAdsEntityType).batchLimit;
  const chunkCount = Math.ceil(itemCount / chunkSize);
  const projection = projectBulkCapacity({
    rateLimiter,
    toolName: "",
    itemCount: chunkCount,
    buckets: oneWritePerChunk(scope),
  });
  return {
    itemCount,
    chunkSize,
    chunkCount,
    chunksThatFit: projection.itemsThatFit,
    itemsThatFit: Math.min(itemCount, projection.itemsThatFit * chunkSize),
    projectedWaitMs: projection.projectedWaitMs,
    budgetMs: projection.budgetMs,
  };
}

function describeChunkedRefusal(p: ChunkedProjection): string {
  const wait = Number.isFinite(p.projectedWaitMs)
    ? `${Math.ceil(p.projectedWaitMs / 1000)}s`
    : "never (a request costs more than the whole limit)";
  return (
    `${p.itemCount} items are sent as ${p.chunkCount} requests of up to ${p.chunkSize}, which ` +
    `would take ${wait} to clear the Microsoft Ads rate limit, more than the ` +
    `${Math.ceil(p.budgetMs / 1000)}s budget. ${p.itemsThatFit} item(s) ` +
    `(${p.chunksThatFit} request(s)) fit right now — split the batch into calls of at most ` +
    `${Math.max(p.itemsThatFit, 1)} items.`
  );
}

/**
 * Chunked batch (bulk create / update): throw `RateLimited` (reason
 * `bulk_exceeds_capacity`) when its requests — one per `batchLimit` items —
 * cannot be admitted in time. `itemsThatFit` is in items, not requests.
 */
export function assertMsAdsChunkedBulkCapacity(
  toolName: string,
  scope: MsAdsQuotaScope,
  entityType: string,
  itemCount: number
): void {
  const p = projectChunked(scope, entityType, itemCount);
  if (p.chunksThatFit >= p.chunkCount) return;
  throw new McpError(
    JsonRpcErrorCode.RateLimited,
    `${toolName}: ${describeChunkedRefusal(p)} Nothing was sent.`,
    {
      reason: "bulk_exceeds_capacity",
      itemCount: p.itemCount,
      itemsThatFit: p.itemsThatFit,
      chunkSize: p.chunkSize,
      chunkCount: p.chunkCount,
      chunksThatFit: p.chunksThatFit,
      projectedWaitMs: Number.isFinite(p.projectedWaitMs) ? p.projectedWaitMs : null,
      budgetMs: p.budgetMs,
      retryAfterMs: Number.isFinite(p.projectedWaitMs)
        ? Math.max(0, p.projectedWaitMs - p.budgetMs)
        : null,
    }
  );
}

/** Dry-run parity for a chunked batch: the `BULK_EXCEEDS_CAPACITY` error, or `undefined`. */
export function chunkedBulkCapacityDryRunError(
  scope: MsAdsQuotaScope,
  entityType: string,
  itemCount: number,
  field: string
): DryRunValidationError | undefined {
  const p = projectChunked(scope, entityType, itemCount);
  if (p.chunksThatFit >= p.chunkCount) return undefined;
  return {
    code: "BULK_EXCEEDS_CAPACITY",
    message: `${describeChunkedRefusal(p)} The call would be refused before any write.`,
    field,
  };
}

/** Dry-run parity for a per-item batch: the `BULK_EXCEEDS_CAPACITY` error, or `undefined`. */
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
      `${itemCount} items would take ${wait} to clear the Microsoft Ads rate limit, more than the ` +
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
