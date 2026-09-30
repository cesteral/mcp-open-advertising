import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  downloadReportLogic,
  downloadReportTool,
} from "../../src/mcp-server/tools/definitions/download-report.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

// #232: TikTok's official SDK (tiktok-business-api-sdk @ f809c39) defines no
// report-task download endpoint and no download URL on report/task/check/.
// The tool used to fetch whatever URL the client passed; it now refuses.
describe("tiktok_download_report (no documented download contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "https://analytics.tiktok.com/reports/task-abc123/report.csv",
    "https://169.254.169.254/computeMetadata/v1/",
    "http://example.com/report.csv",
  ])("refuses %s with InvalidRequest and resolves no session", async (downloadUrl) => {
    await expect(
      downloadReportLogic({ downloadUrl, mode: "rows" } as any, ctx, sdk)
    ).rejects.toMatchObject({
      code: -32600,
      message: expect.stringContaining("tiktok_get_report"),
    });
    expect(mockResolveSessionServices).not.toHaveBeenCalled();
  });

  it("describes itself as unavailable and never walks the async chain", () => {
    expect(downloadReportTool.description).toContain("NOT AVAILABLE");
    expect(downloadReportTool.description).toContain("tiktok_get_report");
    expect(downloadReportTool.description).not.toContain("tiktok_submit_report");
  });
});
