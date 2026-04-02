import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { SnapchatReportingService } from "../../src/services/snapchat/snapchat-reporting-service.js";

const mockRateLimiter = {
  consume: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
};

const mockLogger: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const mockHttpClient = {
  post: vi.fn(),
  get: vi.fn(),
};

const TEST_AD_ACCOUNT_ID = "acct-snap-123";

describe("SnapchatReportingService", () => {
  let service: SnapchatReportingService;

  beforeEach(() => {
    service = new SnapchatReportingService(
      mockRateLimiter as any,
      mockHttpClient as any,
      TEST_AD_ACCOUNT_ID,
      mockLogger
    );
    vi.clearAllMocks();
  });

  it("submitReport sends a GET stats request with async=true and returns report_run_id", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_reports: [{
        async_stats_report: {
          report_run_id: "ASYNC_STATS:acct-snap-123:123",
          async_status: "STARTED",
        },
      }],
    });

    const result = await service.submitReport({
      fields: ["impressions", "swipes"],
      start_time: "2026-03-01T00:00:00Z",
      end_time: "2026-03-04T23:59:59Z",
      dimension_type: "CAMPAIGN",
    });

    expect(result.task_id).toBe("ASYNC_STATS:acct-snap-123:123");
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      `/v1/adaccounts/${TEST_AD_ACCOUNT_ID}/stats`,
      expect.objectContaining({
        async: "true",
        async_format: "csv",
        fields: "impressions,swipes",
        breakdown: "campaign",
      }),
      undefined
    );
  });

  it("pollReport normalizes COMPLETED to COMPLETE and returns the result URL", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_reports: [{
        async_stats_report: {
          report_run_id: "ASYNC_STATS:acct-snap-123:123",
          async_status: "COMPLETED",
          result: "https://example.com/report.csv",
        },
      }],
    });

    const result = await service.pollReport("ASYNC_STATS:acct-snap-123:123");

    expect(result.status).toBe("COMPLETE");
    expect(result.download_url).toBe("https://example.com/report.csv");
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      `/v1/adaccounts/${TEST_AD_ACCOUNT_ID}/stats_report`,
      { report_run_id: "ASYNC_STATS:acct-snap-123:123" },
      undefined
    );
  });

  it("checkReportStatus maps STARTED to RUNNING", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_reports: [{
        async_stats_report: {
          report_run_id: "ASYNC_STATS:acct-snap-123:456",
          async_status: "STARTED",
        },
      }],
    });

    const result = await service.checkReportStatus("ASYNC_STATS:acct-snap-123:456");

    expect(result).toEqual({
      taskId: "ASYNC_STATS:acct-snap-123:456",
      status: "RUNNING",
      downloadUrl: undefined,
    });
  });

  it("downloadReport parses CSV", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100\n2026-03-02,200",
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/report.csv");

    expect(result.headers).toEqual(["date", "impressions"]);
    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it("getReport runs submit -> poll -> download flow using report_run_id", async () => {
    mockHttpClient.get
      .mockResolvedValueOnce({
        request_status: "SUCCESS",
        async_stats_reports: [{
          async_stats_report: {
            report_run_id: "ASYNC_STATS:acct-snap-123:xyz",
            async_status: "STARTED",
          },
        }],
      })
      .mockResolvedValueOnce({
        request_status: "SUCCESS",
        async_stats_reports: [{
          async_stats_report: {
            report_run_id: "ASYNC_STATS:acct-snap-123:xyz",
            async_status: "COMPLETED",
            result: "https://example.com/rpt-xyz.csv",
          },
        }],
      });
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100",
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as Response);

    const result = await service.getReport({
      fields: ["impressions"],
      start_time: "2026-03-01T00:00:00Z",
      end_time: "2026-03-04T23:59:59Z",
    });

    expect(result.taskId).toBe("ASYNC_STATS:acct-snap-123:xyz");
    expect(result.rows).toHaveLength(1);
  });

  it("getReportBreakdowns appends breakdown fields", async () => {
    const getReportSpy = vi.spyOn(service, "getReport").mockResolvedValueOnce({
      headers: ["date", "country"],
      rows: [["2026-03-01", "US"]],
      totalRows: 1,
      taskId: "rpt-bd",
    });

    const result = await service.getReportBreakdowns(
      {
        fields: ["impressions"],
        start_time: "2026-03-01T00:00:00Z",
        end_time: "2026-03-04T23:59:59Z",
      },
      ["swipes"]
    );

    expect(getReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fields: ["impressions", "swipes"] }),
      undefined
    );
    expect(result.taskId).toBe("rpt-bd");
  });
});
