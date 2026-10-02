// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP report downloads are presigned S3 URLs, and the URL is held to
 * `*.amazonaws.com`. Redirects used to be followed by fetch itself, so the
 * allowlist and the SSRF checks applied to the first URL only, and `getReport`
 * (which downloads the `location` Amazon returns) checked nothing. Only
 * `globalThis.fetch` is stubbed; the shared guarded fetch is real.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { McpError } from "@cesteral/shared";
import { AmazonDspReportingService } from "../../src/services/amazon-dsp/amazon-dsp-reporting-service.js";

const S3_URL = "https://dsp-reports.s3.amazonaws.com/rpt-1.csv?X-Amz-Signature=1";

function makeService() {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as any;
  return new AmazonDspReportingService(rateLimiter, {} as any, logger, 1, 3);
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

describe("amazon-dsp downloadReport redirects", () => {
  it.each([
    ["an off-S3 public host", "https://collector.example/r.csv", /not an allowed report host/],
    ["the metadata service", "http://169.254.169.254/latest/meta-data/", /must use https/],
  ])("refuses a redirect to %s before requesting it", async (_label, target, reason) => {
    const sent = stubFetch([{ status: 307, location: target }]);

    const error = await makeService()
      .downloadReport(S3_URL)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/download redirect refused/);
    expect((error as McpError).message).toMatch(reason);
    expect(sent).toEqual([{ url: S3_URL, redirect: "manual" }]);
  });

  it("refuses a non-S3 URL before requesting it, whichever caller passed it", async () => {
    const sent = stubFetch([{ status: 200, body: "a,b\n1,2\n" }]);
    await expect(makeService().downloadReport("https://example.com/r.csv")).rejects.toThrow(
      /not an allowed report host/
    );
    expect(sent).toHaveLength(0);
  });

  it("follows a redirect that stays on S3", async () => {
    const regional = "https://dsp-reports.s3.us-east-1.amazonaws.com/rpt-1.csv?X-Amz-Signature=1";
    const sent = stubFetch([
      { status: 307, location: regional },
      { status: 200, body: "date,impressions\n2026-09-01,5\n" },
    ]);

    const result = await makeService().downloadReport(S3_URL);

    expect(sent.map((s) => s.url)).toEqual([S3_URL, regional]);
    expect(result.headers).toEqual(["date", "impressions"]);
  });
});
