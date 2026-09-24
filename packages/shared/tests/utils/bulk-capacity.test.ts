// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RateLimiter, createPlatformRateLimiter } from "../../src/utils/rate-limiter.js";
import { assertBulkCapacity, projectBulkCapacity } from "../../src/utils/bulk-capacity.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/mcp-errors.js";

describe("RateLimiter.projectAdmissions", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    limiter = new RateLimiter();
    limiter.configure("p:*", 10, 60_000, { maxWaitMs: 120_000 });
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("reports an unlimited key as not configured", () => {
    expect(limiter.projectAdmissions("other:x", [1, 1]).configured).toBe(false);
  });

  it("matches what consume would actually do, and reserves nothing", async () => {
    const projection = limiter.projectAdmissions("p:a", [3, 3, 3, 3, 3]);
    // 3+3+3 fit now; the 4th needs the first three tokens to expire.
    expect(projection.admissionOffsetsMs).toEqual([0, 0, 0, 60_000, 60_000]);
    expect(limiter.getRemainingTokens("p:a")).toBe(10);

    const admitted: number[] = [];
    const all = [3, 3, 3, 3, 3].map((t) =>
      limiter.consume("p:a", t).then(() => admitted.push(Date.now()))
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(all);
    expect(admitted).toEqual([0, 0, 0, 60_000, 60_000]);
  });

  it("accounts for callers already queued on the key", async () => {
    const queued = [limiter.consume("p:a", 10), limiter.consume("p:a", 10)];
    expect(limiter.projectAdmissions("p:a", [1]).admissionOffsetsMs).toEqual([120_000]);
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(queued);
  });

  it("marks a request costing more than the limit, and everything after it, Infinity", () => {
    expect(limiter.projectAdmissions("p:a", [1, 11, 1]).admissionOffsetsMs).toEqual([
      0,
      Infinity,
      Infinity,
    ]);
  });
});

describe("assertBulkCapacity", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // The fleet default for 10/min servers: two-window queue budget.
    limiter = createPlatformRateLimiter("p", 10);
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it("passes a batch that clears within the queue budget", () => {
    // 9 items x 3 tokens = 27 tokens: admitted at 0 / 60s / 120s.
    const result = assertBulkCapacity({
      rateLimiter: limiter,
      toolName: "p_bulk",
      itemCount: 9,
      buckets: [{ key: "p:acct", costPerItem: [3] }],
    });
    expect(result.itemsThatFit).toBe(9);
    expect(result.projectedWaitMs).toBe(120_000);
  });

  // The failure this exists for: a 50-item batch that would queue for ~15
  // minutes and outlive every client timeout. Refuse it before any write.
  it("refuses a batch that would queue past the budget, naming how many fit", () => {
    let error: unknown;
    try {
      assertBulkCapacity({
        rateLimiter: limiter,
        toolName: "p_bulk",
        itemCount: 50,
        buckets: [{ key: "p:acct", costPerItem: [3] }],
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(McpError);
    const mcp = error as McpError;
    expect(mcp.code).toBe(JsonRpcErrorCode.RateLimited);
    expect(mcp.message).toContain("nothing was sent");
    expect(mcp.data).toMatchObject({
      reason: "bulk_exceeds_capacity",
      itemCount: 50,
      itemsThatFit: 9,
    });
    expect(limiter.getRemainingTokens("p:acct")).toBe(10);
  });

  it("counts every consume an item makes (read + write)", () => {
    // [1, 3] = 4 tokens per item: 2 items per window -> 6 items within 120s.
    const result = projectBulkCapacity({
      rateLimiter: limiter,
      toolName: "p_bulk",
      itemCount: 20,
      buckets: [{ key: "p:acct", costPerItem: [1, 3] }],
    });
    expect(result.itemsThatFit).toBe(6);
  });

  it("takes the tightest of several buckets", () => {
    const two = createPlatformRateLimiter("q", 100);
    two.configure("r:*", 5, 60_000, { maxWaitMs: 0 });
    const result = projectBulkCapacity({
      rateLimiter: two,
      toolName: "q_bulk",
      itemCount: 20,
      buckets: [
        { key: "q:read", costPerItem: [1] },
        { key: "r:write", costPerItem: [1] },
      ],
    });
    expect(result.itemsThatFit).toBe(5);
    two.destroy();
  });

  it("ignores buckets with no configured limit", () => {
    const result = assertBulkCapacity({
      rateLimiter: limiter,
      toolName: "p_bulk",
      itemCount: 1000,
      buckets: [{ key: "unlimited:x", costPerItem: [3] }],
    });
    expect(result.itemsThatFit).toBe(1000);
  });

  it("honours an explicit budget", () => {
    expect(
      projectBulkCapacity({
        rateLimiter: limiter,
        toolName: "p_bulk",
        itemCount: 9,
        buckets: [{ key: "p:acct", costPerItem: [3] }],
        maxProjectedWaitMs: 0,
      }).itemsThatFit
    ).toBe(3);
  });
});
