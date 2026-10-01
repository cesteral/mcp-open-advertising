// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Fleet review 2026-09, dbm #2 (the open half): one synchronous report run
 * had no total wall-time cap. With the default poll and retry settings a
 * single tools/call could sit in create → run → poll → cooldown → retry for
 * about 72 minutes, long past the 300 s a hosted (Cloud Run) request survives.
 * The loop is now capped at `reportSyncMaxWallTimeMs`; the async task tool
 * opts out with `maxWallTimeMs: null`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JsonRpcErrorCode } from "@cesteral/shared";
import type { AppConfig } from "../../src/config/index.js";
import { parseConfig } from "../../src/config/index.js";
import { BidManagerService } from "../../src/services/bid-manager/BidManagerService.js";
import { DEFAULT_REPORT_SYNC_MAX_WALL_TIME_MS } from "../../src/services/bid-manager/report-timing.js";
import { ReportWallTimeExceededError } from "../../src/utils/errors/bid-manager-errors.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: "silent",
} as any;

const CAP_MS = 1_000;

/** The shipped defaults' shape, scaled down: a run can take far longer than the cap. */
function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    reportPollInitialDelayMs: 100,
    reportPollMaxDelayMs: 300,
    reportPollMaxRetries: 1_000,
    reportQueryRetries: 5,
    reportRetryCooldownMs: 60_000,
    reportSyncMaxWallTimeMs: CAP_MS,
    ...overrides,
  } as AppConfig;
}

function client(states: () => string) {
  return {
    queries: {
      create: vi.fn().mockResolvedValue({ data: { queryId: "q-1" } }),
      run: vi.fn().mockResolvedValue({ data: { key: { reportId: "r-1" } } }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
      reports: {
        get: vi.fn().mockImplementation(async () => {
          const state = states();
          return {
            data: {
              metadata: {
                status: { state },
                ...(state === "DONE"
                  ? { googleCloudStoragePath: "https://storage.googleapis.com/b/r.csv" }
                  : {}),
              },
            },
          };
        }),
      },
    },
  } as any;
}

const spec = {
  metadata: {
    title: "cap",
    dataRange: { range: "LAST_7_DAYS" as const },
    format: "CSV" as const,
  },
  params: {
    type: "STANDARD" as const,
    groupBys: ["FILTER_DATE" as const],
    metrics: ["METRIC_IMPRESSIONS" as const],
  },
};

/** Advance fake time by `ms` and report how the promise settled (if it did). */
async function settleWithin<T>(promise: Promise<T>, ms: number) {
  let outcome: { value?: T; error?: any } | undefined;
  promise.then(
    (value) => (outcome = { value }),
    (error) => (outcome = { error })
  );
  for (let t = 0; t < ms && !outcome; t += 50) {
    await vi.advanceTimersByTimeAsync(50);
  }
  return outcome;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("synchronous report run wall-time cap", () => {
  it("stops polling a report that never finishes at the cap, as a Timeout naming it", async () => {
    const c = client(() => "RUNNING");
    const service = new BidManagerService(config(), logger, c);

    const outcome = await settleWithin(service.executeQueryWithRetry(spec), CAP_MS + 500);

    expect(outcome, "still running past the cap").toBeDefined();
    expect(outcome!.error).toBeInstanceOf(ReportWallTimeExceededError);
    expect(outcome!.error.code).toBe(JsonRpcErrorCode.Timeout);
    expect(outcome!.error.message).toContain("1s synchronous wall-time cap");
    expect(outcome!.error.message).toContain("q-1");
    expect(outcome!.error.message).toContain("dbm_run_custom_query_async");
    // No new request after the cap: one create, one run, and polling stopped.
    expect(c.queries.create).toHaveBeenCalledOnce();
    expect(c.queries.run).toHaveBeenCalledOnce();
    const polls = c.queries.reports.get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(c.queries.reports.get.mock.calls.length).toBe(polls);
  });

  it("cuts the retry cooldown short at the cap and keeps the last cause", async () => {
    // FAILED is retryable (re-run the query), so a 60 s cooldown follows.
    const c = client(() => "FAILED");
    const service = new BidManagerService(config(), logger, c);

    const outcome = await settleWithin(service.executeQueryWithRetry(spec), CAP_MS + 500);

    expect(outcome, "still in the 60 s cooldown past the cap").toBeDefined();
    expect(outcome!.error).toBeInstanceOf(ReportWallTimeExceededError);
    expect(outcome!.error.message).toContain("last status: FAILED");
    expect(outcome!.error.message).toContain("state FAILED");
    expect(c.queries.run).toHaveBeenCalledOnce();
  });

  it("caps at the default when the config sets none", async () => {
    const c = client(() => "RUNNING");
    const service = new BidManagerService(
      config({ reportSyncMaxWallTimeMs: undefined as any }),
      logger,
      c
    );

    let settled: any;
    service.executeQueryWithRetry(spec).catch((error) => (settled = error));

    await vi.advanceTimersByTimeAsync(DEFAULT_REPORT_SYNC_MAX_WALL_TIME_MS - 1_000);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).toBeInstanceOf(ReportWallTimeExceededError);
    expect(settled.maxWallTimeMs).toBe(DEFAULT_REPORT_SYNC_MAX_WALL_TIME_MS);
  });

  it("does not cap a run that passes maxWallTimeMs: null (the async task tool)", async () => {
    let polls = 0;
    // Finishes at about 3 s of fake time — three times the configured cap.
    const c = client(() => (++polls >= 12 ? "DONE" : "RUNNING"));
    const service = new BidManagerService(config(), logger, c);

    const outcome = await settleWithin(
      service.executeQueryWithRetry(spec, { maxWallTimeMs: null }),
      10_000
    );

    expect(outcome?.error).toBeUndefined();
    expect(outcome?.value?.reportId).toBe("r-1");
    expect(polls).toBe(12);
  });

  it("lets a run that finishes inside the cap succeed", async () => {
    let polls = 0;
    const c = client(() => (++polls >= 2 ? "DONE" : "RUNNING"));
    const service = new BidManagerService(config(), logger, c);

    const outcome = await settleWithin(service.executeQueryWithRetry(spec), CAP_MS);

    expect(outcome?.value?.gcsPath).toBe("https://storage.googleapis.com/b/r.csv");
  });
});

describe("REPORT_SYNC_MAX_WALL_TIME_MS", () => {
  const saved = process.env.REPORT_SYNC_MAX_WALL_TIME_MS;

  afterEach(() => {
    if (saved === undefined) delete process.env.REPORT_SYNC_MAX_WALL_TIME_MS;
    else process.env.REPORT_SYNC_MAX_WALL_TIME_MS = saved;
  });

  it("defaults below Cloud Run's 300 s default request timeout", () => {
    delete process.env.REPORT_SYNC_MAX_WALL_TIME_MS;
    expect(parseConfig().reportSyncMaxWallTimeMs).toBe(DEFAULT_REPORT_SYNC_MAX_WALL_TIME_MS);
    expect(DEFAULT_REPORT_SYNC_MAX_WALL_TIME_MS).toBeLessThan(300_000);
  });

  it("is read from the environment", () => {
    process.env.REPORT_SYNC_MAX_WALL_TIME_MS = "600000";
    expect(parseConfig().reportSyncMaxWallTimeMs).toBe(600_000);
  });
});
