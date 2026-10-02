import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  const fetchWithTimeout = vi.fn();
  return {
    ...actual,
    fetchWithTimeout,
    // Downloads go through the redirect-guarded fetch; route it to the same
    // mock with fetchWithTimeout's argument order so the assertions read alike.
    // The guard itself is exercised against a stubbed global fetch elsewhere.
    fetchGuardedDownload: (
      url: string,
      o: { timeoutMs: number; context?: unknown; init?: RequestInit }
    ) =>
      o.init === undefined
        ? fetchWithTimeout(url, o.timeoutMs, o.context)
        : fetchWithTimeout(url, o.timeoutMs, o.context, o.init),
  };
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
      async_stats_reports: [
        {
          async_stats_report: {
            report_run_id: "ASYNC_STATS:acct-snap-123:123",
            async_status: "STARTED",
          },
        },
      ],
    });

    const result = await service.submitReport({
      fields: ["impressions", "swipes"],
      start_time: "2026-03-01T00:00:00-08:00",
      end_time: "2026-03-05T00:00:00-08:00",
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
      async_stats_reports: [
        {
          async_stats_report: {
            report_run_id: "ASYNC_STATS:acct-snap-123:123",
            async_status: "COMPLETED",
            result: "https://example.com/report.csv",
          },
        },
      ],
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
      async_stats_reports: [
        {
          async_stats_report: {
            report_run_id: "ASYNC_STATS:acct-snap-123:456",
            async_status: "STARTED",
          },
        },
      ],
    });

    const result = await service.checkReportStatus("ASYNC_STATS:acct-snap-123:456");

    expect(result).toEqual({
      taskId: "ASYNC_STATS:acct-snap-123:456",
      status: "RUNNING",
      rawStatus: "STARTED",
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
        async_stats_reports: [
          {
            async_stats_report: {
              report_run_id: "ASYNC_STATS:acct-snap-123:xyz",
              async_status: "STARTED",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        request_status: "SUCCESS",
        async_stats_reports: [
          {
            async_stats_report: {
              report_run_id: "ASYNC_STATS:acct-snap-123:xyz",
              async_status: "COMPLETED",
              result: "https://example.com/rpt-xyz.csv",
            },
          },
        ],
      });
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100",
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as Response);

    const result = await service.getReport({
      fields: ["impressions"],
      start_time: "2026-03-01T00:00:00Z",
      end_time: "2026-03-05T00:00:00Z",
    });

    expect(result.taskId).toBe("ASYNC_STATS:acct-snap-123:xyz");
    expect(result.rows).toHaveLength(1);
  });

  describe("report_dimension (#233)", () => {
    const submitResponse = {
      request_status: "SUCCESS",
      async_stats_reports: [
        { async_stats_report: { report_run_id: "ASYNC_STATS:x:1", async_status: "STARTED" } },
      ],
    };

    it("submitReport sends report_dimension as its own query parameter, not inside fields", async () => {
      mockHttpClient.get.mockResolvedValueOnce(submitResponse);

      await service.submitReport({
        fields: ["impressions", "spend"],
        granularity: "TOTAL",
        start_time: "2026-03-01T00:00:00-08:00",
        end_time: "2026-03-02T00:00:00-08:00",
        report_dimension: "age,gender",
      });

      const params = mockHttpClient.get.mock.calls[0]![1] as Record<string, string>;
      expect(params.report_dimension).toBe("age,gender");
      expect(params.fields).toBe("impressions,spend");
    });

    it("omits report_dimension when none is requested", async () => {
      mockHttpClient.get.mockResolvedValueOnce(submitResponse);
      await service.submitReport({
        fields: ["impressions"],
        start_time: "2026-03-01T00:00:00-08:00",
        end_time: "2026-03-02T00:00:00-08:00",
      });
      expect(mockHttpClient.get.mock.calls[0]![1]).not.toHaveProperty("report_dimension");
    });

    it("getReportBreakdowns passes the dimension through and leaves fields untouched", async () => {
      const getReportSpy = vi.spyOn(service, "getReport").mockResolvedValueOnce({
        headers: ["date", "country"],
        rows: [["2026-03-01", "US"]],
        totalRows: 1,
        taskId: "rpt-bd",
      });

      const result = await service.getReportBreakdowns(
        {
          fields: ["impressions"],
          start_time: "2026-03-01T00:00:00-08:00",
          end_time: "2026-03-02T00:00:00-08:00",
        },
        "country"
      );

      expect(getReportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ fields: ["impressions"], report_dimension: "country" }),
        expect.any(Number),
        undefined
      );
      expect(result.taskId).toBe("rpt-bd");
    });
  });

  describe("time bounds (#233)", () => {
    it("refuses DAY-granularity bounds that are off the start of an hour", async () => {
      await expect(
        service.submitReport({
          fields: ["impressions"],
          granularity: "DAY",
          start_time: "2026-03-01T00:00:00Z",
          end_time: "2026-03-04T23:59:59Z",
        })
      ).rejects.toThrow(/end_time.*start of an hour/);
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it("does not apply the hour rule to TOTAL granularity", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        async_stats_reports: [
          { async_stats_report: { report_run_id: "r", async_status: "STARTED" } },
        ],
      });
      await expect(
        service.submitReport({
          fields: ["impressions"],
          granularity: "TOTAL",
          start_time: "2026-03-01T00:00:00Z",
          end_time: "2026-03-04T23:59:59Z",
        })
      ).resolves.toEqual({ task_id: "r" });
    });

    it("reads the ad account's timezone once and resolves a preset at its midnight", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        adaccounts: [
          {
            sub_request_status: "SUCCESS",
            adaccount: { id: TEST_AD_ACCOUNT_ID, timezone: "America/Los_Angeles" },
          },
        ],
      });

      const first = await service.resolveDatePresetRange("LAST_7_DAYS");
      const second = await service.resolveDatePresetRange("YESTERDAY");

      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        `/v1/adaccounts/${TEST_AD_ACCOUNT_ID}`,
        {},
        undefined
      );
      for (const bound of [first.start_time, first.end_time, second.start_time, second.end_time]) {
        expect(bound).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00-0[78]:00$/);
      }
      // A 7-day preset spans 7 days, then the exclusive end is the following midnight.
      const days =
        (Date.parse(first.end_time) - Date.parse(first.start_time)) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(7);
    });

    it("fails clearly when the account timezone cannot be read", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ request_status: "SUCCESS", adaccounts: [] });
      await expect(service.resolveDatePresetRange("YESTERDAY")).rejects.toThrow(/timezone/);
    });
  });
});
