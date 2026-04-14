// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import pino from "pino";
import {
  recordUpstreamRequest,
  getRecordedUpstreamRequests,
  clearRecordedUpstreamRequests,
  redactHeaders,
  truncateBody,
  MAX_CAPTURED_BODY_BYTES,
} from "../../src/utils/http-request-recorder.js";
import { runWithRequestContext } from "../../src/utils/request-context.js";
import { executeWithRetry } from "../../src/utils/retryable-fetch.js";
import type { FetchWithTimeoutFn } from "../../src/utils/retryable-fetch.js";

const logger = pino({ level: "silent" });

describe("redactHeaders", () => {
  it("redacts sensitive headers (case-insensitive)", () => {
    const out = redactHeaders({
      Authorization: "Bearer abc.def.ghi",
      "x-ttd-api-secret": "super-secret",
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "key-123",
    });
    expect(out["Authorization"]).toBe("[REDACTED]");
    expect(out["x-ttd-api-secret"]).toBe("[REDACTED]");
    expect(out["X-Goog-Api-Key"]).toBe("[REDACTED]");
    expect(out["Content-Type"]).toBe("application/json");
  });

  it("handles Headers objects", () => {
    const h = new Headers();
    h.set("authorization", "Bearer x");
    h.set("x-request-id", "req-1");
    const out = redactHeaders(h);
    expect(out["authorization"]).toBe("[REDACTED]");
    expect(out["x-request-id"]).toBe("req-1");
  });

  it("returns empty object for undefined", () => {
    expect(redactHeaders(undefined)).toEqual({});
  });
});

describe("truncateBody", () => {
  it("returns undefined for nullish / empty input", () => {
    expect(truncateBody(undefined)).toBeUndefined();
    expect(truncateBody(null)).toBeUndefined();
    expect(truncateBody("")).toBeUndefined();
  });

  it("redacts bearer tokens in string bodies", () => {
    const out = truncateBody("got Bearer abc.def.ghi in body");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abc.def.ghi");
  });

  it("redacts access_token JSON fields", () => {
    const out = truncateBody(JSON.stringify({ access_token: "super-secret", other: "ok" }));
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("super-secret");
    expect(out).toContain("ok");
  });

  it("truncates bodies that exceed the byte cap", () => {
    const big = "x".repeat(MAX_CAPTURED_BODY_BYTES + 1000);
    const out = truncateBody(big);
    expect(out!.length).toBeLessThan(big.length);
    expect(out).toContain("[TRUNCATED");
  });
});

describe("recordUpstreamRequest / ALS scoping", () => {
  it("no-ops outside a request context", () => {
    clearRecordedUpstreamRequests();
    recordUpstreamRequest({ method: "GET", url: "https://example.com", durationMs: 1 });
    // Outside of a context, the read still returns [] — the write is a no-op.
    expect(getRecordedUpstreamRequests()).toEqual([]);
  });

  it("records and reads within a context", () => {
    runWithRequestContext(
      { requestId: "r1", timestamp: new Date().toISOString() },
      () => {
        recordUpstreamRequest({ method: "POST", url: "https://a", durationMs: 1 });
        recordUpstreamRequest({ method: "POST", url: "https://a", durationMs: 2, status: 400 });
        const entries = getRecordedUpstreamRequests();
        expect(entries).toHaveLength(2);
        expect(entries[1]!.status).toBe(400);
      },
    );
  });

  it("bounds the array to the most recent 20 entries", () => {
    runWithRequestContext(
      { requestId: "r1", timestamp: new Date().toISOString() },
      () => {
        for (let i = 0; i < 25; i++) {
          recordUpstreamRequest({ method: "GET", url: `https://x/${i}`, durationMs: i });
        }
        const entries = getRecordedUpstreamRequests();
        expect(entries).toHaveLength(20);
        expect(entries[0]!.url).toBe("https://x/5");
        expect(entries[19]!.url).toBe("https://x/24");
      },
    );
  });
});

describe("executeWithRetry integration", () => {
  it("records upstream failure with redacted body", async () => {
    const fetchFn: FetchWithTimeoutFn = async () =>
      new Response(JSON.stringify({ error: "invalid advertiser", access_token: "leak-me" }), {
        status: 400,
        statusText: "Bad Request",
      });

    await runWithRequestContext(
      { requestId: "r1", timestamp: new Date().toISOString() },
      async () => {
        await expect(
          executeWithRetry(
            { maxRetries: 0, initialBackoffMs: 1, maxBackoffMs: 1, platformName: "TestPlatform" },
            {
              url: "https://api.example.com/endpoint",
              fetchOptions: {
                method: "POST",
                body: JSON.stringify({ campaignName: "x" }),
              },
              logger,
              getHeaders: async () => ({ Authorization: "Bearer secret-token" }),
              fetchFn,
            },
          ),
        ).rejects.toThrow();

        const entries = getRecordedUpstreamRequests();
        expect(entries).toHaveLength(1);
        expect(entries[0]!.status).toBe(400);
        expect(entries[0]!.method).toBe("POST");
        expect(entries[0]!.url).toBe("https://api.example.com/endpoint");
        expect(entries[0]!.requestBodyRedacted).toContain("campaignName");
        expect(entries[0]!.requestHeadersRedacted?.["Authorization"]).toBe("[REDACTED]");
        expect(entries[0]!.responseBodyRedacted).toContain("invalid advertiser");
        expect(entries[0]!.responseBodyRedacted).not.toContain("leak-me");
      },
    );
  });

  it("records one entry per retry attempt", async () => {
    let count = 0;
    const fetchFn: FetchWithTimeoutFn = async () => {
      count++;
      return new Response("boom", { status: 500, statusText: "Server Error" });
    };

    await runWithRequestContext(
      { requestId: "r2", timestamp: new Date().toISOString() },
      async () => {
        await expect(
          executeWithRetry(
            { maxRetries: 2, initialBackoffMs: 1, maxBackoffMs: 1, platformName: "TestPlatform" },
            {
              url: "https://api.example.com/x",
              logger,
              getHeaders: async () => ({}),
              fetchFn,
            },
          ),
        ).rejects.toThrow();

        expect(count).toBe(3);
        const entries = getRecordedUpstreamRequests();
        expect(entries).toHaveLength(3);
        expect(entries.map((e) => e.attempt)).toEqual([0, 1, 2]);
      },
    );
  });

  it("records 2xx envelope failures with the parsed response body", async () => {
    // Emulates TikTok/Snapchat: HTTP 200 but payload contains platform error.
    const envelopePayload = { code: 40002, message: "invalid advertiser id", data: null };
    const fetchFn: FetchWithTimeoutFn = async () =>
      new Response(JSON.stringify(envelopePayload), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });

    const { McpError, JsonRpcErrorCode } = await import("../../src/utils/mcp-errors.js");

    await runWithRequestContext(
      { requestId: "rEnv", timestamp: new Date().toISOString() },
      async () => {
        await expect(
          executeWithRetry(
            { maxRetries: 0, initialBackoffMs: 1, maxBackoffMs: 1, platformName: "TestPlatform" },
            {
              url: "https://api.example.com/envelope",
              logger,
              getHeaders: async () => ({}),
              fetchFn,
              validateResponseBody: (body: unknown) => {
                const b = body as { code: number; message: string };
                if (b.code !== 0) {
                  throw new McpError(JsonRpcErrorCode.InvalidRequest, b.message, {
                    envelopeCode: b.code,
                  });
                }
                return b;
              },
            },
          ),
        ).rejects.toThrow(/invalid advertiser id/);

        const entries = getRecordedUpstreamRequests();
        expect(entries).toHaveLength(1);
        expect(entries[0]!.status).toBe(200);
        expect(entries[0]!.responseBodyRedacted).toContain("invalid advertiser id");
        expect(entries[0]!.responseBodyRedacted).toContain("40002");
      },
    );
  });

  it("does not include response body on successful envelope validation", async () => {
    const fetchFn: FetchWithTimeoutFn = async () =>
      new Response(JSON.stringify({ code: 0, data: { ok: true, secret: "should-not-leak" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    await runWithRequestContext(
      { requestId: "rOk", timestamp: new Date().toISOString() },
      async () => {
        const result = await executeWithRetry(
          { maxRetries: 0, initialBackoffMs: 1, maxBackoffMs: 1, platformName: "TestPlatform" },
          {
            url: "https://api.example.com/ok",
            logger,
            getHeaders: async () => ({}),
            fetchFn,
            validateResponseBody: (body: unknown) => (body as { data: unknown }).data,
          },
        );

        expect(result).toEqual({ ok: true, secret: "should-not-leak" });
        const entries = getRecordedUpstreamRequests();
        expect(entries).toHaveLength(1);
        expect(entries[0]!.status).toBe(200);
        expect(entries[0]!.responseBodyRedacted).toBeUndefined();
      },
    );
  });

  it("records network errors as the final attempt", async () => {
    const fetchFn: FetchWithTimeoutFn = async () => {
      throw new Error("ECONNREFUSED");
    };

    await runWithRequestContext(
      { requestId: "r3", timestamp: new Date().toISOString() },
      async () => {
        await expect(
          executeWithRetry(
            { maxRetries: 0, initialBackoffMs: 1, maxBackoffMs: 1, platformName: "TestPlatform" },
            {
              url: "https://api.example.com/y",
              logger,
              getHeaders: async () => ({}),
              fetchFn,
            },
          ),
        ).rejects.toThrow("ECONNREFUSED");

        const entries = getRecordedUpstreamRequests();
        expect(entries).toHaveLength(1);
        expect(entries[0]!.networkError).toBe("ECONNREFUSED");
      },
    );
  });
});
