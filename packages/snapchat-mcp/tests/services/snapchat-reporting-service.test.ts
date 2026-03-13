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

  it("submitReport sends create request to Snapchat async_reporting endpoint and returns report id", async () => {
    mockHttpClient.post.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_reports: [{ id: "rpt-123", status: "PENDING", download_url: null }],
    });

    const result = await service.submitReport({
      fields: ["impressions", "swipes"],
      start_time: "2026-03-01T00:00:00Z",
      end_time: "2026-03-04T23:59:59Z",
    });

    expect(result.task_id).toBe("rpt-123");
    expect(mockHttpClient.post).toHaveBeenCalledWith(
      `/v1/adaccounts/${TEST_AD_ACCOUNT_ID}/stats/async_reporting`,
      expect.objectContaining({ fields: ["impressions", "swipes"] }),
      undefined
    );
  });

  it("pollReport returns COMPLETE result", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_report: {
        id: "rpt-123",
        status: "COMPLETE",
        download_url: "https://example.com/report.csv",
      },
    });

    const result = await service.pollReport("rpt-123");
    expect(result.status).toBe("COMPLETE");
    expect(result.download_url).toContain("report.csv");
  });

  it("downloadReport parses CSV", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100\n2026-03-02,200",
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/report.csv");

    expect(result.headers).toEqual(["date", "impressions"]);
    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(2);
  });

  it("getReport runs submit -> poll -> download flow", async () => {
    mockHttpClient.post.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_reports: [{ id: "rpt-xyz", status: "PENDING", download_url: null }],
    });
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_report: {
        id: "rpt-xyz",
        status: "COMPLETE",
        download_url: "https://example.com/rpt-xyz.csv",
      },
    });
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100",
    } as unknown as Response);

    const result = await service.getReport({
      fields: ["impressions"],
      start_time: "2026-03-01T00:00:00Z",
      end_time: "2026-03-04T23:59:59Z",
    });

    expect(result.taskId).toBe("rpt-xyz");
    expect(result.rows).toHaveLength(1);
  });

  it("checkReportStatus makes single GET to Snapchat async_reports endpoint and returns status", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_report: {
        id: "rpt-456",
        status: "RUNNING",
      },
    });

    const result = await service.checkReportStatus("rpt-456");

    expect(result.taskId).toBe("rpt-456");
    expect(result.status).toBe("RUNNING");
    expect(result.downloadUrl).toBeUndefined();
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      `/v1/adaccounts/${TEST_AD_ACCOUNT_ID}/stats/async_reports/rpt-456`,
      undefined,
      undefined
    );
  });

  it("checkReportStatus returns downloadUrl when COMPLETE", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_report: {
        id: "rpt-789",
        status: "COMPLETE",
        download_url: "https://example.com/done-report.csv",
      },
    });

    const result = await service.checkReportStatus("rpt-789");

    expect(result.status).toBe("COMPLETE");
    expect(result.downloadUrl).toBe("https://example.com/done-report.csv");
  });

  it("checkReportStatus consumes rate limiter once", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      request_status: "SUCCESS",
      async_stats_report: {
        id: "rpt-rl",
        status: "PENDING",
      },
    });

    await service.checkReportStatus("rpt-rl");

    expect(mockRateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith("snapchat:reporting");
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
