// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import pino from "pino";
import { executeWithRetry } from "../../src/utils/retryable-fetch.js";
import type { FetchWithTimeoutFn, RetryConfig } from "../../src/utils/retryable-fetch.js";
import { McpError } from "../../src/utils/mcp-errors.js";
import { runWithRequestContext } from "../../src/utils/request-context.js";
import { getRecordedUpstreamRequests } from "../../src/utils/http-request-recorder.js";

/**
 * `rawResponse` exists for non-JSON bodies (cm360 report CSV downloads,
 * cross-fleet #22) that still need the shared retry policy and upstream trail.
 */

const logger = pino({ level: "silent" });
const config: RetryConfig = {
  maxRetries: 2,
  initialBackoffMs: 1,
  maxBackoffMs: 1,
  platformName: "TestPlatform",
};

function sequence(...responses: Array<() => Response>): {
  fetchFn: FetchWithTimeoutFn;
  calls: () => number;
} {
  let i = 0;
  return {
    fetchFn: async () => responses[Math.min(i++, responses.length - 1)](),
    calls: () => i,
  };
}

describe("executeWithRetry — rawResponse", () => {
  it("returns the successful Response unread instead of parsing JSON", async () => {
    const { fetchFn } = sequence(() => new Response("a,b\n1,2\n", { status: 200 }));

    const result = await executeWithRetry(config, {
      url: "https://api.example.com/file.csv",
      logger,
      getHeaders: async () => ({}),
      fetchFn,
      rawResponse: true,
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.bodyUsed).toBe(false);
    expect(await result.text()).toBe("a,b\n1,2\n");
  });

  it("retries and records every attempt like the JSON path", async () => {
    const { fetchFn, calls } = sequence(
      () => new Response("busy", { status: 503 }),
      () => new Response("a,b\n", { status: 200 })
    );

    const trail = await runWithRequestContext(
      { requestId: "r1", timestamp: new Date().toISOString() },
      async () => {
        await executeWithRetry(config, {
          url: "https://api.example.com/file.csv",
          logger,
          getHeaders: async () => ({}),
          fetchFn,
          rawResponse: true,
        });
        return [...getRecordedUpstreamRequests()];
      }
    );

    expect(calls()).toBe(2);
    expect(trail.map((r) => r.status)).toEqual([503, 200]);
  });

  it("still throws McpError on a non-retryable failure", async () => {
    const { fetchFn, calls } = sequence(() => new Response("gone", { status: 404 }));

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/file.csv",
        logger,
        getHeaders: async () => ({}),
        fetchFn,
        rawResponse: true,
      })
    ).rejects.toBeInstanceOf(McpError);
    expect(calls()).toBe(1);
  });

  it("without the flag, a non-JSON body still fails to parse (default unchanged)", async () => {
    const { fetchFn } = sequence(() => new Response("a,b\n", { status: 200 }));

    await expect(
      executeWithRetry(config, {
        url: "https://api.example.com/file.csv",
        logger,
        getHeaders: async () => ({}),
        fetchFn,
      })
    ).rejects.toThrow();
  });
});
