// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";

export interface BulkResult<R = unknown> {
  success: boolean;
  entity?: R;
  error?: string;
}

/**
 * Execute operations in batches with bounded concurrency.
 * Processes items in groups of `concurrency` (default 5) using Promise.allSettled.
 */
export async function executeBulkConcurrent<T, R = unknown>(
  items: T[],
  operation: (item: T) => Promise<R>,
  options?: { concurrency?: number; logger?: Logger }
): Promise<BulkResult<R>[]> {
  const concurrency = options?.concurrency ?? 5;
  const logger = options?.logger;
  const results: BulkResult<R>[] = new Array(items.length);

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((item) => operation(item))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results[i + j] = { success: true, entity: result.value };
      } else {
        logger?.debug({ error: result.reason }, "Bulk operation item failed");
        results[i + j] = {
          success: false,
          error: result.reason?.message ?? String(result.reason),
        };
      }
    }
  }

  return results;
}
