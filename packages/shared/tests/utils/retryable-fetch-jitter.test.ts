// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import pino from "pino";
import {
  executeWithRetry,
  parseRetryAfterMs,
  applyBackoffJitter,
  applyRequiredWaitJitter,
} from "../../src/utils/http/retryable-fetch.js";
import type { RetryConfig, FetchWithTimeoutFn } from "../../src/utils/http/retryable-fetch.js";
import { McpError } from "../../src/utils/mcp-errors.js";

const logger = pino({ level: "silent" });
const config: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 1_000,
  maxBackoffMs: 10_000,
  platformName: "Test",
};

function sequence(...responses: Array<() => Response>): FetchWithTimeoutFn & { calls: number } {
  const fn = (async () => {
    const make = responses[Math.min(fn.calls, responses.length - 1)]!;
    fn.calls++;
    return make();
  }) as FetchWithTimeoutFn & { calls: number };
  fn.calls = 0;
  return fn;
}

const status =
  (code: number, headers: Record<string, string> = {}) =>
  () =>
    new Response("nope", { status: code, statusText: "err", headers });
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

function run(fetchFn: FetchWithTimeoutFn, method = "GET") {
  return executeWithRetry(config, {
    url: "https://api.example.test/x",
    fetchOptions: { method },
    logger,
    getHeaders: async () => ({}),
    fetchFn,
  });
}

describe("parseRetryAfterMs", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("parses integer seconds", () => {
    expect(parseRetryAfterMs("5", now)).toBe(5_000);
    expect(parseRetryAfterMs(" 120 ", now)).toBe(120_000);
    expect(parseRetryAfterMs("0", now)).toBe(0);
  });

  it("parses an HTTP-date relative to now", () => {
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
  });

  it("clamps a date in the past to 0", () => {
    expect(parseRetryAfterMs("Wed, 31 Dec 2025 23:59:00 GMT", now)).toBe(0);
  });

  it("returns undefined for absent or unparseable values", () => {
    expect(parseRetryAfterMs(null, now)).toBeUndefined();
    expect(parseRetryAfterMs(undefined, now)).toBeUndefined();
    expect(parseRetryAfterMs("", now)).toBeUndefined();
    expect(parseRetryAfterMs("soon", now)).toBeUndefined();
    expect(parseRetryAfterMs("-5", now)).toBeUndefined();
  });
});

describe("jitter helpers", () => {
  it("applyBackoffJitter draws from [delay/2, delay]", () => {
    expect(applyBackoffJitter(1_000, () => 0)).toBe(500);
    expect(applyBackoffJitter(1_000, () => 1)).toBe(1_000);
    for (let i = 0; i < 200; i++) {
      const v = applyBackoffJitter(1_000);
      expect(v).toBeGreaterThanOrEqual(500);
      expect(v).toBeLessThanOrEqual(1_000);
    }
  });

  it("applyRequiredWaitJitter never shortens the platform's wait", () => {
    expect(applyRequiredWaitJitter(10_000, () => 0)).toBe(10_000);
    expect(applyRequiredWaitJitter(10_000, () => 1)).toBe(12_000);
    for (let i = 0; i < 200; i++) {
      expect(applyRequiredWaitJitter(10_000)).toBeGreaterThanOrEqual(10_000);
    }
  });

  it("two instances with different draws do not retry in lockstep", () => {
    expect(applyBackoffJitter(4_000, () => 0.1)).not.toBe(applyBackoffJitter(4_000, () => 0.9));
  });
});

describe("executeWithRetry backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("jitters the exponential backoff within [delay/2, delay]", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchFn = sequence(status(503), ok);
    const result = run(fetchFn);

    await vi.advanceTimersByTimeAsync(499);
    expect(fetchFn.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn.calls).toBe(2);
    await expect(result).resolves.toEqual({ ok: true });

    random.mockReturnValue(1);
    const fetchFn2 = sequence(status(503), ok);
    const result2 = run(fetchFn2);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchFn2.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn2.calls).toBe(2);
    await expect(result2).resolves.toEqual({ ok: true });
  });

  it("honours an HTTP-date Retry-After and adds upward jitter only", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const retryAt = new Date("2026-01-01T00:00:03Z").toUTCString();
    const fetchFn = sequence(status(429, { "Retry-After": retryAt }), ok);
    const result = run(fetchFn);

    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchFn.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFn.calls).toBe(2);
    await expect(result).resolves.toEqual({ ok: true });
  });

  it("surfaces an HTTP-date wait longer than maxBackoffMs instead of retrying early", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const retryAt = new Date("2026-01-01T00:02:00Z").toUTCString();
    const fetchFn = sequence(status(429, { "Retry-After": retryAt }), ok);
    const error = await run(fetchFn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).data?.retryAfterMs).toBe(120_000);
    expect(fetchFn.calls).toBe(1);
  });

  it("keeps write safety: POST is retried on 429 but not on 5xx", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const post503 = sequence(status(503), ok);
    const failed = await run(post503, "POST").catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(McpError);
    expect(post503.calls).toBe(1);

    const post429 = sequence(status(429), ok);
    const result = run(post429, "POST");
    await vi.advanceTimersByTimeAsync(500);
    expect(post429.calls).toBe(2);
    await expect(result).resolves.toEqual({ ok: true });
  });
});
