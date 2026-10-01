// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `ttd_download_report` sends `TTD-Auth` to TTD-hosted download URLs. That is
 * a custom header, which no runtime strips on a cross-origin redirect, so with
 * `redirect: "follow"` a TTD host redirecting elsewhere handed the token on,
 * and the host allowlist was checked on the first URL only. Only
 * `globalThis.fetch` is stubbed; the shared guarded fetch is real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpError } from "@cesteral/shared";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { downloadReportLogic } from "../../src/mcp-server/tools/definitions/download-report.tool.js";

const TTD_URL = "https://api.thetradedesk.com/v3/myreports/view/abc/report.csv";
const S3_URL = "https://ttd-reports.s3.amazonaws.com/abc/report.csv?X-Amz-Signature=1";

function stubFetch(
  responses: Array<{ status: number; location?: string; body?: string; type?: string }>
) {
  const sent: Array<{ url: string; ttdAuth: string | null }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    sent.push({ url: String(input), ttdAuth: new Headers(init?.headers).get("ttd-auth") });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    const headers: Record<string, string> = {};
    if (next.location) headers.location = next.location;
    if (next.type) headers["content-type"] = next.type;
    return new Response(next.body ?? null, { status: next.status, headers });
  });
  return sent;
}

function download(downloadUrl: string) {
  return downloadReportLogic(
    { downloadUrl, mode: "rows", maxRows: 10 } as any,
    { requestId: "req-1" } as any,
    { sessionId: "s-1" } as any
  );
}

beforeEach(() => {
  delete process.env.REPORT_SPILL_BUCKET;
  mockResolveSessionServices.mockReturnValue({
    authAdapter: { getAccessToken: vi.fn().mockResolvedValue("ttd-token") },
  });
});

afterEach(() => vi.restoreAllMocks());

describe("ttd_download_report redirects", () => {
  it("sends TTD-Auth to the TTD host only, never to the S3 hop it redirects to", async () => {
    const sent = stubFetch([
      { status: 302, location: S3_URL },
      { status: 200, body: "AdvertiserId,Impressions\nadv-1,10\n", type: "text/csv" },
    ]);

    const result = await download(TTD_URL);

    expect(sent.map((s) => s.url)).toEqual([TTD_URL, S3_URL]);
    expect(sent.map((s) => s.ttdAuth)).toEqual(["ttd-token", null]);
    expect(result.headers).toEqual(["AdvertiserId", "Impressions"]);
  });

  it.each([
    [
      "an off-allowlist public host",
      "https://collector.example/steal",
      /not an allowed report host/,
    ],
    ["the metadata service", "http://169.254.169.254/latest/meta-data/", /must use https/],
  ])("refuses a redirect to %s before requesting it", async (_label, target, reason) => {
    const sent = stubFetch([{ status: 302, location: target }]);

    const error = await download(TTD_URL).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/ttd_download_report: download redirect refused/);
    expect((error as McpError).message).toMatch(reason);
    expect(sent.map((s) => s.url)).toEqual([TTD_URL]);
  });
});
