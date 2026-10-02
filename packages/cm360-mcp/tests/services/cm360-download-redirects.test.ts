// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `cm360_download_report` sends the user's Google bearer token. The URL is
 * checked against the googleapis.com allowlist, but redirects were followed by
 * fetch itself: a redirect target was never checked, and whether the token
 * reached another origin depended on the Node release (fleet review cm360 #1).
 * Only `globalThis.fetch` is stubbed: the retry loop and the guarded fetch are
 * real.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import pino from "pino";
import { McpError } from "@cesteral/shared";
import { CM360HttpClient } from "../../src/services/cm360/cm360-http-client.js";

const DOWNLOAD_URL = "https://www.googleapis.com/dfareporting/v5/reports/1/files/2?alt=media";

function makeClient(): CM360HttpClient {
  const authAdapter = { getAccessToken: vi.fn().mockResolvedValue("tok"), validate: vi.fn() };
  return new CM360HttpClient(
    authAdapter as any,
    "https://dfareporting.googleapis.com/dfareporting/v5",
    pino({ level: "silent" })
  );
}

function stubFetch(responses: Array<{ status: number; location?: string; body?: string }>) {
  const sent: Array<{ url: string; authorization: string | null; redirect?: RequestRedirect }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    sent.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
      redirect: init?.redirect,
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

describe("cm360 fetchRaw redirects", () => {
  it("refuses a redirect to an internal address without requesting it or retrying", async () => {
    const sent = stubFetch([
      { status: 302, location: "http://169.254.169.254/computeMetadata/v1/" },
    ]);
    const error = await makeClient()
      .fetchRaw(DOWNLOAD_URL, 30_000)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/cm360_download_report: download redirect refused/);
    expect(sent.map((s) => s.url)).toEqual([DOWNLOAD_URL]);
    expect(sent[0]?.redirect).toBe("manual");
  });

  it("keeps the token on the same origin and drops it on another", async () => {
    const sent = stubFetch([
      { status: 302, location: "/dfareporting/v5/reports/1/files/2?alt=media&hop=1" },
      { status: 307, location: "https://storage.googleapis.com/b/report.csv?sig=1" },
      { status: 200, body: "Date,Clicks\n2026-09-01,5\n" },
    ]);
    const response = await makeClient().fetchRaw(DOWNLOAD_URL, 30_000);

    expect(await response.text()).toBe("Date,Clicks\n2026-09-01,5\n");
    expect(sent.map((s) => s.authorization)).toEqual(["Bearer tok", "Bearer tok", null]);
    expect(sent[2]?.url).toBe("https://storage.googleapis.com/b/report.csv?sig=1");
  });
});
