// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, afterEach } from "vitest";
import pino from "pino";
import { executeWithRetry } from "../../src/utils/retryable-fetch.js";
import type { RetryConfig, FetchWithTimeoutFn } from "../../src/utils/retryable-fetch.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/mcp-errors.js";

const logger = pino({ level: "silent" });
const config: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 100,
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

const throttled =
  (headers: Record<string, string> = {}, body = "slow down") =>
  () =>
    new Response(body, { status: 429, statusText: "Too Many Requests", headers });
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

afterEach(() => vi.useRealTimers());

describe("executeWithRetry — platform-named waits", () => {
  // The old behaviour capped Retry-After at maxBackoffMs, so a platform saying
  // "wait 120s" was re-sent after 10s — which only extends the throttle.
  it("does not retry early when Retry-After exceeds maxBackoffMs; surfaces retryAfterMs", async () => {
    const fetchFn = sequence(throttled({ "Retry-After": "120" }), ok);
    const error = await executeWithRetry(config, {
      url: "https://api.example.com/x",
      logger,
      getHeaders: async () => ({}),
      fetchFn,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((error as McpError).data?.retryAfterMs).toBe(120_000);
    expect(fetchFn.calls).toBe(1);
  });

  it("still retries after a Retry-After that fits the budget", async () => {
    vi.useFakeTimers();
    const fetchFn = sequence(throttled({ "Retry-After": "2" }), ok);
    const pending = executeWithRetry(config, {
      url: "https://api.example.com/x",
      logger,
      getHeaders: async () => ({}),
      fetchFn,
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchFn.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchFn.calls).toBe(2);
  });

  it("uses the platform's documented wait when there is no Retry-After", async () => {
    const fetchFn = sequence(throttled(), ok);
    const error = await executeWithRetry(config, {
      url: "https://api.example.com/x",
      logger,
      getHeaders: async () => ({}),
      fetchFn,
      throttleDelayMs: (status) => (status === 429 ? 60_000 : undefined),
    }).catch((e) => e);
    expect((error as McpError).data?.retryAfterMs).toBe(60_000);
    expect(fetchFn.calls).toBe(1);
  });

  it("a Retry-After header wins over the documented wait", async () => {
    vi.useFakeTimers();
    const fetchFn = sequence(throttled({ "Retry-After": "1" }), ok);
    const pending = executeWithRetry(config, {
      url: "https://api.example.com/x",
      logger,
      getHeaders: async () => ({}),
      fetchFn,
      throttleDelayMs: () => 60_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("recognises a body-level throttle on a non-429 status", async () => {
    const body = JSON.stringify({ Errors: [{ Code: 117, ErrorCode: "CallRateExceeded" }] });
    const fetchFn = sequence(() => new Response(body, { status: 400, statusText: "Bad Request" }));
    const error = await executeWithRetry(config, {
      url: "https://api.example.com/x",
      logger,
      getHeaders: async () => ({}),
      fetchFn,
      throttleDelayMs: (_s, b) => (b.includes("CallRateExceeded") ? 60_000 : undefined),
      mapStatusCode: (s, b) =>
        b.includes("CallRateExceeded")
          ? JsonRpcErrorCode.RateLimited
          : JsonRpcErrorCode.InvalidRequest,
    }).catch((e) => e);
    expect((error as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((error as McpError).data?.retryAfterMs).toBe(60_000);
    expect(fetchFn.calls).toBe(1);
  });
});
