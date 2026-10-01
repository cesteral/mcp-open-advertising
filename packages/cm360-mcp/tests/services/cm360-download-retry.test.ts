// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, afterEach } from "vitest";
import pino from "pino";
import {
  McpError,
  runWithRequestContext,
  getRecordedUpstreamRequests,
  type UpstreamHttpRecord,
} from "@cesteral/shared";
import { CM360HttpClient } from "../../src/services/cm360/cm360-http-client.js";

/**
 * Fleet review _cross-fleet #22: cm360's `fetchRaw` (report downloads) had a
 * hand-rolled retry loop that bypassed `executeWithRetry`, so a failed
 * download recorded no upstream trail in `tool_failure` logs and ignored
 * `Retry-After`. These run the real shared retry loop against a stubbed
 * global fetch, with nothing in between mocked.
 */

const DOWNLOAD_URL = "https://www.googleapis.com/dfareporting/v5/reports/1/files/2?alt=media";

function makeClient(): CM360HttpClient {
  const authAdapter = {
    getAccessToken: vi.fn().mockResolvedValue("tok"),
    validate: vi.fn(),
  } as any;
  return new CM360HttpClient(
    authAdapter,
    "https://dfareporting.googleapis.com/dfareporting/v5",
    pino({ level: "silent" })
  );
}

async function inToolContext<T>(
  fn: () => Promise<T>
): Promise<{ result?: T; error?: unknown; trail: UpstreamHttpRecord[] }> {
  return runWithRequestContext(
    { requestId: "req-dl", timestamp: new Date().toISOString() },
    async () => {
      try {
        const result = await fn();
        return { result, trail: [...getRecordedUpstreamRequests()] };
      } catch (error) {
        return { error, trail: [...getRecordedUpstreamRequests()] };
      }
    }
  );
}

describe("cm360 report download retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries a 503, returns the CSV body unread, and records both attempts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response("Date,Clicks\n2026-09-01,5\n", {
          status: 200,
          headers: { "Content-Type": "text/csv" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result, trail } = await inToolContext(() =>
      makeClient().fetchRaw(DOWNLOAD_URL, 30_000)
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toBeInstanceOf(Response);
    expect(await result!.text()).toBe("Date,Clicks\n2026-09-01,5\n");
    expect(trail.map((r) => r.status)).toEqual([503, 200]);
    expect(trail[0].responseBodyRedacted).toBe("unavailable");
  }, 15_000);

  it("records a failed download in the upstream trail and throws McpError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"File not found"}}', { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const { error, trail } = await inToolContext(() => makeClient().fetchRaw(DOWNLOAD_URL, 30_000));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toContain("404");
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ method: "GET", status: 404 });
    expect(trail[0].responseBodyRedacted).toContain("File not found");
    // The bearer token never reaches the trail.
    expect(JSON.stringify(trail)).not.toContain("Bearer tok");
  });
});
