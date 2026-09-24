// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { assertBulkCapacity, projectBulkCapacity } from "@cesteral/shared";
import type { BulkCapacityResult, DryRunValidationError } from "@cesteral/shared";
import { rateLimiter } from "../../../utils/platform.js";
import {
  cm360BulkCapacityCheck,
  type CM360BulkOperation,
} from "../../../services/cm360/cm360-service.js";

/**
 * Refuse a CM360 bulk batch that cannot clear the `cm360:{profileId}` rate
 * limit within the queue budget — BEFORE any confirmation prompt or upstream
 * call. Throws `McpError(RateLimited)` with `data.reason: "bulk_exceeds_capacity"`
 * and `itemsThatFit`.
 */
export function assertCM360BulkCapacity(
  toolName: string,
  operation: CM360BulkOperation,
  profileId: string,
  itemCount: number
): BulkCapacityResult {
  return assertBulkCapacity(
    cm360BulkCapacityCheck(rateLimiter, toolName, operation, profileId, itemCount)
  );
}

/**
 * Dry-run parity for {@link assertCM360BulkCapacity}: the validation error the
 * real call would be refused with, or `undefined` when the batch fits.
 */
export function cm360BulkCapacityDryRunError(
  toolName: string,
  operation: CM360BulkOperation,
  profileId: string,
  itemCount: number,
  field: string
): DryRunValidationError | undefined {
  const projection = projectBulkCapacity(
    cm360BulkCapacityCheck(rateLimiter, toolName, operation, profileId, itemCount)
  );
  if (projection.itemsThatFit >= itemCount) return undefined;
  const wait = Number.isFinite(projection.projectedWaitMs)
    ? `${Math.ceil(projection.projectedWaitMs / 1000)}s`
    : "never";
  return {
    code: "BULK_EXCEEDS_CAPACITY",
    message:
      `${itemCount} items would take ${wait} to clear the CM360 rate limit for profile ` +
      `${profileId}, more than the ${Math.ceil(projection.budgetMs / 1000)}s budget, so the ` +
      `call would be refused before any write. ${projection.itemsThatFit} item(s) fit right ` +
      `now — split the batch into chunks of at most ${Math.max(projection.itemsThatFit, 1)}.`,
    field,
  };
}
