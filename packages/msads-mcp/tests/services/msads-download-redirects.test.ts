// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Microsoft Advertising report downloads are anonymous fetches of a signed URL, reached from
 * `msads_download_report` (a URL from the MCP client) and `getReport` (the
 * `ReportDownloadUrl` Microsoft returns). Redirects used to be followed by fetch itself, so only the
 * first URL was ever checked and an admitted host could bounce the server to
 * an internal address. Only `globalThis.fetch` is stubbed; the shared guarded
 * fetch is real.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { McpError } from "@cesteral/shared";
import { MsAdsReportingService } from "../../src/services/msads/msads-reporting-service.js";

const REPORT_URL = "https://bingadsappsstorageprod.blob.core.windows.net/reports/r-1.zip?sig=1";

function makeService() {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as any;
  return new MsAdsReportingService(rateLimiter, {} as any, logger, {
    userId: "u1",
    customerId: "c1",
  });
}

function stubFetch(responses: Array<{ status: number; location?: string; body?: string }>) {
  const sent: Array<{ url: string; redirect?: RequestRedirect }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    sent.push({ url: String(input), redirect: init?.redirect });
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

describe("msads downloadReport redirects", () => {
  it.each([
    "http://169.254.169.254/computeMetadata/v1/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://10.0.0.7/internal.csv",
  ])("refuses a redirect to %s before requesting it", async (target) => {
    const sent = stubFetch([{ status: 302, location: target }]);

    const error = await makeService()
      .downloadReport(REPORT_URL)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/download redirect refused/);
    expect(sent).toEqual([{ url: REPORT_URL, redirect: "manual" }]);
  });

  it("refuses an internal URL before requesting it, whichever caller passed it", async () => {
    const sent = stubFetch([{ status: 200, body: "a,b\n1,2\n" }]);
    await expect(
      makeService().downloadReport("https://metadata.google.internal/report.csv")
    ).rejects.toThrow(/download URL host metadata.google.internal is not a public host/);
    expect(sent).toHaveLength(0);
  });

  it("follows a redirect to another public host", async () => {
    const sent = stubFetch([
      {
        status: 307,
        location: "https://bingadsappsstorageprod2.blob.core.windows.net/reports/r-1.zip?sig=1",
      },
      { status: 200, body: "date,impressions\n2026-09-01,5\n" },
    ]);

    await makeService().downloadReport(REPORT_URL);

    expect(sent.map((s) => s.url)).toEqual([
      REPORT_URL,
      "https://bingadsappsstorageprod2.blob.core.windows.net/reports/r-1.zip?sig=1",
    ]);
  });
});
