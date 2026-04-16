// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi } from "vitest";
import {
  pollUntilComplete,
  ReportAbortedError,
  ReportFailedError,
  ReportTimeoutError,
} from "../../src/utils/report-polling.js";

describe("pollUntilComplete", () => {
  it("resolves when isComplete returns true", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "running" })
      .mockResolvedValueOnce({ state: "complete" });
    const result = await pollUntilComplete({
      fetchStatus,
      isComplete: (s) => s.state === "complete",
      initialDelayMs: 1,
      maxDelayMs: 2,
    });
    expect(result.state).toBe("complete");
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("throws ReportFailedError when isFailed returns true", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: "failed" });
    await expect(
      pollUntilComplete({
        fetchStatus,
        isComplete: (s) => s.state === "complete",
        isFailed: (s) => s.state === "failed",
        initialDelayMs: 1,
      }),
    ).rejects.toBeInstanceOf(ReportFailedError);
  });

  it("throws ReportTimeoutError after maxAttempts", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: "pending" });
    await expect(
      pollUntilComplete({
        fetchStatus,
        isComplete: () => false,
        initialDelayMs: 1,
        maxAttempts: 3,
      }),
    ).rejects.toBeInstanceOf(ReportTimeoutError);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("runs exactly one fetch when maxAttempts is 1", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ state: "pending" });
    await expect(
      pollUntilComplete({
        fetchStatus,
        isComplete: () => false,
        maxAttempts: 1,
        initialDelayMs: 1000,
      }),
    ).rejects.toBeInstanceOf(ReportTimeoutError);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("rejects immediately when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchStatus = vi.fn().mockResolvedValue({ state: "pending" });
    await expect(
      pollUntilComplete({
        fetchStatus,
        isComplete: () => false,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ReportAbortedError);
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("aborts on signal", async () => {
    const controller = new AbortController();
    const fetchStatus = vi.fn().mockResolvedValue({ state: "pending" });
    const promise = pollUntilComplete({
      fetchStatus,
      isComplete: () => false,
      initialDelayMs: 50,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toBeInstanceOf(ReportAbortedError);
  });

  it("applies exponential backoff capped by maxDelayMs", async () => {
    const delays: number[] = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      delays.push(ms ?? 0);
      return origSetTimeout(fn, 0);
    }) as typeof setTimeout);
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "complete" });
    await pollUntilComplete({
      fetchStatus,
      isComplete: (s) => s.state === "complete",
      initialDelayMs: 100,
      maxDelayMs: 300,
      backoffFactor: 2,
    });
    expect(delays).toEqual([100, 200, 300]);
    vi.restoreAllMocks();
  });
});
