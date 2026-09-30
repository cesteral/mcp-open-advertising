import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  submitReportLogic,
  submitReportTool,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

const mockSubmitReport = vi.fn();

beforeEach(() => {
  mockSubmitReport.mockReset();
  mockResolveSessionServices.mockReset();
  mockResolveSessionServices.mockReturnValue({
    tiktokReportingService: { submitReport: mockSubmitReport },
    boundAdvertiserId: "1234567890",
  });
});

// #232: a task created via report/task/create/ could never be fetched — the
// official SDK defines no report-task download operation and no download URL
// on report/task/check/. The tool refuses before anything reaches TikTok.
describe("submitReportLogic (refuses: no documented download contract)", () => {
  it("refuses with InvalidRequest and never submits a task", async () => {
    await expect(
      submitReportLogic(
        {
          advertiserId: "1234567890",
          reportType: "AUDIENCE",
          serviceType: "AUCTION",
          dataLevel: "AUCTION_ADGROUP",
          dimensions: ["campaign_id", "stat_time_day"],
          metrics: ["impressions", "clicks"],
          startDate: "2026-03-01",
          endDate: "2026-03-04",
          dry_run: false,
        } as any,
        baseContext,
        baseSdkContext
      )
    ).rejects.toMatchObject({
      code: -32600,
      message: expect.stringContaining("No report task was created"),
    });
    expect(mockSubmitReport).not.toHaveBeenCalled();
    expect(mockResolveSessionServices).not.toHaveBeenCalled();
  });

  it("refuses even for an advertiser other than the bound one (refusal precedes scope checks)", async () => {
    await expect(
      submitReportLogic(
        {
          advertiserId: "9999999999",
          dimensions: ["campaign_id"],
          metrics: ["impressions"],
          datePreset: "LAST_7_DAYS",
        } as any,
        baseContext,
        baseSdkContext
      )
    ).rejects.toMatchObject({ code: -32600 });
    expect(mockSubmitReport).not.toHaveBeenCalled();
  });
});

describe("submitReportTool definition", () => {
  it("describes itself as unavailable and points at the synchronous tools", () => {
    expect(submitReportTool.description).toContain("NOT AVAILABLE");
    expect(submitReportTool.description).toContain("tiktok_get_report");
    expect(submitReportTool.description).toContain("tiktok_get_report_breakdowns");
    expect(submitReportTool.description).not.toContain("tiktok_download_report");
    expect(submitReportTool.description).not.toContain("tiktok_check_report_status");
  });
});
