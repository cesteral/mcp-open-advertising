// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi } from "vitest";
import { executeBulkConcurrent } from "../../src/utils/bulk-executor.js";

describe("executeBulkConcurrent", () => {
  it("returns one BulkResult per input item, ordered by input index", async () => {
    const results = await executeBulkConcurrent([1, 2, 3, 4, 5], async (n) => n * 10);
    expect(results.map((r) => r.entity)).toEqual([10, 20, 30, 40, 50]);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("preserves input order when batches resolve out-of-order", async () => {
    const order: number[] = [];
    const results = await executeBulkConcurrent(
      [50, 10, 30, 0, 20],
      async (delay) => {
        await new Promise((r) => setTimeout(r, delay));
        order.push(delay);
        return delay;
      },
      { concurrency: 5 }
    );
    // Items resolve in delay-order (0 first, 50 last) but results stay in input order
    expect(order[0]).toBe(0);
    expect(order[order.length - 1]).toBe(50);
    expect(results.map((r) => r.entity)).toEqual([50, 10, 30, 0, 20]);
  });

  it("records per-item failure without aborting the batch", async () => {
    const results = await executeBulkConcurrent([1, 2, 3], async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(results[0]).toEqual({ success: true, entity: 1 });
    expect(results[1]).toEqual({ success: false, error: "boom" });
    expect(results[2]).toEqual({ success: true, entity: 3 });
  });

  it("stringifies non-Error rejection values for the error field", async () => {
    const results = await executeBulkConcurrent([1, 2], async (n) => {
      if (n === 2) throw "raw-string"; // eslint-disable-line @typescript-eslint/only-throw-error
      return n;
    });
    expect(results[1].error).toBe("raw-string");
  });

  it("handles failures in the final partial batch (cross-batch index math)", async () => {
    // 7 items at concurrency 3 → batches of [0,1,2], [3,4,5], [6]
    // Fail items 0, 4, 6 to exercise the boundary indices
    const results = await executeBulkConcurrent(
      [0, 1, 2, 3, 4, 5, 6],
      async (n) => {
        if (n === 0 || n === 4 || n === 6) throw new Error(`fail-${n}`);
        return n;
      },
      { concurrency: 3 }
    );

    expect(results).toHaveLength(7);
    expect(results.map((r) => r.success)).toEqual([false, true, true, true, false, true, false]);
    expect(results[0].error).toBe("fail-0");
    expect(results[4].error).toBe("fail-4");
    expect(results[6].error).toBe("fail-6");
  });

  it("bounds concurrent invocations by the configured batch size", async () => {
    let active = 0;
    let peakActive = 0;
    const operation = async (n: number) => {
      active++;
      peakActive = Math.max(peakActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n;
    };
    await executeBulkConcurrent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], operation, {
      concurrency: 3,
    });
    expect(peakActive).toBeLessThanOrEqual(3);
    expect(peakActive).toBeGreaterThan(1);
  });

  it("returns an empty array for an empty input without calling the operation", async () => {
    const operation = vi.fn(async (n: number) => n);
    const results = await executeBulkConcurrent([], operation);
    expect(results).toEqual([]);
    expect(operation).not.toHaveBeenCalled();
  });

  it("defaults concurrency to 5 when not specified", async () => {
    let active = 0;
    let peakActive = 0;
    await executeBulkConcurrent(
      Array.from({ length: 12 }, (_, i) => i),
      async (n) => {
        active++;
        peakActive = Math.max(peakActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return n;
      }
    );
    expect(peakActive).toBeLessThanOrEqual(5);
  });
});
