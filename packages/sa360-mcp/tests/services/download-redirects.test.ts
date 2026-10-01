// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `sa360_download_report` sends the user's Google bearer token. The URL is
 * checked against the googleapis.com allowlist, but redirects were followed by
 * fetch itself: a redirect target was never checked, and whether the token
 * reached another origin depended on the Node release (fleet review sa360 #3).
 * Here only `globalThis.fetch` is stubbed; the shared guarded fetch is real.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { McpError } from "@cesteral/shared";
import { SA360ReportingService } from "../../src/services/sa360-v2/reporting-service.js";

const FILE_URL = "https://www.googleapis.com/doubleclicksearch/v2/reports/r1/files/0";

function makeService() {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const authAdapter = { getAccessToken: vi.fn().mockResolvedValue("tok") } as any;
  const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as any;
  return new SA360ReportingService(logger, rateLimiter, {} as any, authAdapter);
}

function stubFetch(responses: Array<{ status: number; location?: string; body?: string }>) {
  const sent: Array<{ url: string; authorization: string | null }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    sent.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return new Response(next.body ?? null, {
      status: next.status,
      headers: next.location ? { location: next.location } : {},
    });
  });
  return sent;
}

afterEach(() => vi.restoreAllMocks());

describe("sa360 downloadReport redirects", () => {
  it("refuses a redirect to an internal address without requesting it", async () => {
    const sent = stubFetch([
      { status: 302, location: "http://169.254.169.254/computeMetadata/v1/" },
    ]);
    const error = await makeService()
      .downloadReport(FILE_URL)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/redirect refused/);
    expect(sent.map((s) => s.url)).toEqual([FILE_URL]);
  });

  it("keeps the token on the same origin and drops it on another", async () => {
    const sent = stubFetch([
      { status: 302, location: "/doubleclicksearch/v2/reports/r1/files/0?alt=media" },
      { status: 302, location: "https://storage.googleapis.com/b/r1.csv?sig=1" },
      { status: 200, body: "a,b\n1,2\n" },
    ]);
    const csv = await makeService().downloadReport(FILE_URL);

    expect(csv).toBe("a,b\n1,2\n");
    expect(sent.map((s) => s.authorization)).toEqual(["Bearer tok", "Bearer tok", null]);
  });
});
