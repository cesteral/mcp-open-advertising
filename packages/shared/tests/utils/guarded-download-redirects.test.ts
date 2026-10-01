// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `fetchGuardedDownload` follows report-download redirects by hand: every hop
 * passes the generic URL checks, and credential headers never reach another
 * origin. With `redirect: "follow"` only the first URL was checked.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchGuardedDownload,
  MAX_GUARDED_DOWNLOAD_REDIRECTS,
} from "../../src/utils/download-url-guard.js";
import { McpError } from "../../src/utils/mcp-errors.js";

interface Sent {
  url: string;
  headers: Record<string, string>;
  redirect: RequestRedirect | undefined;
}

function stubFetch(responses: Array<{ status: number; location?: string; body?: string }>) {
  const sent: Sent[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    sent.push({
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      redirect: init?.redirect,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return new Response(next.body ?? null, {
      status: next.status,
      headers: next.location ? { location: next.location } : {},
    });
  });
  return { sent, spy };
}

afterEach(() => vi.restoreAllMocks());

const START = "https://www.googleapis.com/doubleclicksearch/v2/reports/r1/files/0";

describe("fetchGuardedDownload", () => {
  it("never lets fetch follow a redirect on its own", async () => {
    const { sent } = stubFetch([{ status: 200, body: "a,b" }]);
    const response = await fetchGuardedDownload(START, { timeoutMs: 1000 });
    expect(await response.text()).toBe("a,b");
    expect(sent[0]?.redirect).toBe("manual");
  });

  it.each([
    "http://169.254.169.254/computeMetadata/v1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://localhost/x",
    "http://www.googleapis.com/x",
  ])("refuses a redirect to %s before requesting it", async (target) => {
    const { sent } = stubFetch([{ status: 302, location: target }]);
    const error = await fetchGuardedDownload(START, {
      timeoutMs: 1000,
      toolName: "sa360_download_report",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/sa360_download_report: .*redirect refused/);
    expect(sent).toHaveLength(1);
  });

  it("drops Authorization and declared credential headers on a cross-origin hop", async () => {
    const { sent } = stubFetch([
      { status: 302, location: "/files/0?alt=media" },
      { status: 307, location: "https://storage.googleapis.com/bucket/report.csv?sig=1" },
      { status: 200, body: "ok" },
    ]);
    await fetchGuardedDownload(START, {
      timeoutMs: 1000,
      init: { headers: { Authorization: "Bearer t", "TTD-Auth": "x", Accept: "text/csv" } },
      credentialHeaders: ["TTD-Auth"],
    });

    expect(sent.map((s) => s.url)).toEqual([
      START,
      "https://www.googleapis.com/files/0?alt=media",
      "https://storage.googleapis.com/bucket/report.csv?sig=1",
    ]);
    // Same origin: the credential is kept.
    expect(sent[1]?.headers).toMatchObject({ authorization: "Bearer t", "ttd-auth": "x" });
    // Another origin: both credentials are gone, other headers stay.
    expect(sent[2]?.headers.authorization).toBeUndefined();
    expect(sent[2]?.headers["ttd-auth"]).toBeUndefined();
    expect(sent[2]?.headers.accept).toBe("text/csv");
  });

  it("gives up after the redirect limit", async () => {
    stubFetch(
      Array.from({ length: MAX_GUARDED_DOWNLOAD_REDIRECTS + 1 }, (_, i) => ({
        status: 302,
        location: `https://www.googleapis.com/hop/${i}`,
      }))
    );
    await expect(fetchGuardedDownload(START, { timeoutMs: 1000 })).rejects.toThrow(
      /redirected more than/
    );
  });

  it("returns a non-redirect error response to the caller unchanged", async () => {
    stubFetch([{ status: 404, body: "nope" }]);
    const response = await fetchGuardedDownload(START, { timeoutMs: 1000 });
    expect(response.status).toBe(404);
  });
});
