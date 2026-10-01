import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import {
  TikTokReportingService,
  mapTikTokReportTaskStatus,
} from "../../src/services/tiktok/tiktok-reporting-service.js";

const mockRateLimiter = {
  consume: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
};

const mockLogger: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const mockHttpClient = {
  // The session's per-token rate-limit identity (rate-limit-keys.ts).
  quotaClient: "0123456789abcdef",
  post: vi.fn(),
  get: vi.fn(),
};
const REPORTING_KEY = "tiktok:token:0123456789abcdef:reporting";

describe("TikTokReportingService", () => {
  let service: TikTokReportingService;

  beforeEach(() => {
    service = new TikTokReportingService(mockRateLimiter as any, mockHttpClient as any, mockLogger);
    vi.clearAllMocks();
  });

  it("submitReport sends create request and returns task id", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ task_id: "task-123" });

    const result = await service.submitReport({
      dimensions: ["campaign_id"],
      metrics: ["impressions"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
    });

    expect(result.task_id).toBe("task-123");
    expect(mockHttpClient.post).toHaveBeenCalledWith(
      "/open_api/v1.3/report/task/create/",
      expect.objectContaining({ dimensions: ["campaign_id"] }),
      undefined
    );
  });

  // report_task_create.yml: service_type is required by the request rule
  // (SDK default AUCTION); data_level is a body field; page/page_size are not.
  it("submitReport sends service_type and data_level, never page/page_size", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ task_id: "task-1" });

    await service.submitReport({
      dimensions: ["campaign_id"],
      metrics: ["spend"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
      data_level: "AUCTION_CAMPAIGN",
      page: 2,
      page_size: 50,
    } as any);

    const body = mockHttpClient.post.mock.calls[0][1];
    expect(body).toMatchObject({
      report_type: "BASIC",
      service_type: "AUCTION",
      data_level: "AUCTION_CAMPAIGN",
    });
    expect(body).not.toHaveProperty("page");
    expect(body).not.toHaveProperty("page_size");
  });

  it("submitReport asks for a downloadable CSV and stable column names", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ task_id: "task-1" });

    await service.submitReport({
      dimensions: ["campaign_id"],
      metrics: ["spend"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
    });

    // CSV_DOWNLOAD makes report/task/download/ answer with a JSON envelope
    // holding download_url (CSV_STRING answers with a raw CSV stream). Title
    // translation off keeps headers as field names ("campaign_id", not
    // "Campaign ID"), which TikTok recommends and which column projection
    // depends on.
    expect(mockHttpClient.post.mock.calls[0]![1]).toMatchObject({
      output_format: "CSV_DOWNLOAD",
      enable_report_title_translation: false,
    });
  });

  it("submitReport leaves title translation alone for report types that do not support it", async () => {
    mockHttpClient.post.mockResolvedValueOnce({ task_id: "task-1" });

    await service.submitReport({
      report_type: "PLAYABLE_MATERIAL",
      dimensions: ["playable_id"],
      metrics: ["impressions"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
    });

    const body = mockHttpClient.post.mock.calls[0]![1];
    expect(body).toMatchObject({ output_format: "CSV_DOWNLOAD" });
    expect(body).not.toHaveProperty("enable_report_title_translation");
  });

  it("pollReport waits through QUEUING and PROCESSING and returns at SUCCESS", async () => {
    // Task statuses per TikTok's report/task/check docs: QUEUING, PROCESSING,
    // SUCCESS, FAILED, CANCELED.
    mockHttpClient.get
      .mockResolvedValueOnce({ status: "QUEUING" })
      .mockResolvedValueOnce({ status: "PROCESSING" })
      .mockResolvedValueOnce({ status: "SUCCESS" });
    const fast = new TikTokReportingService(
      mockRateLimiter as any,
      mockHttpClient as any,
      mockLogger,
      1,
      10
    );

    const result = await fast.pollReport("task-123");

    expect(result.status).toBe("SUCCESS");
    expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
  });

  it("pollReport returns a FAILED task with TikTok's message", async () => {
    mockHttpClient.get.mockResolvedValueOnce({ status: "FAILED", message: "bad dimensions" });
    const result = await service.pollReport("task-123");
    expect(result.status).toBe("FAILED");
    expect(result.message).toBe("bad dimensions");
  });

  it("pollReport stops at once on an unrecognized status instead of polling to timeout", async () => {
    mockHttpClient.get.mockResolvedValue({ status: "SOMETHING_NEW" });

    const result = await service.pollReport("task-123");
    expect(result.status).toBe("SOMETHING_NEW");
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
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

  it("downloadReport returns empty dataset for empty body", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "",
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/report.csv");

    expect(result).toEqual({ headers: [], rows: [], totalRows: 0 });
  });

  it("downloadReport returns empty dataset for BOM-only or whitespace-only body", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "\uFEFF \n\t",
    } as unknown as Response);

    const result = await service.downloadReport("https://example.com/report.csv");

    expect(result).toEqual({ headers: [], rows: [], totalRows: 0 });
  });

  it("getReport uses the synchronous report/integrated/get endpoint and flattens rows", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      list: [
        { dimensions: { campaign_id: "c1" }, metrics: { impressions: "100", spend: "1.5" } },
        { dimensions: { campaign_id: "c2" }, metrics: { impressions: "50", spend: "0.5" } },
      ],
      page_info: { page: 1, page_size: 1000, total_number: 2, total_page: 1 },
    });

    const result = await service.getReport({
      dimensions: ["campaign_id"],
      metrics: ["impressions", "spend"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
      data_level: "AUCTION_CAMPAIGN",
    });

    expect(mockHttpClient.post).not.toHaveBeenCalled();
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    const [path, params] = mockHttpClient.get.mock.calls[0];
    expect(path).toBe("/open_api/v1.3/report/integrated/get/");
    expect(params).toMatchObject({
      report_type: "BASIC",
      service_type: "AUCTION",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["campaign_id"]),
      metrics: JSON.stringify(["impressions", "spend"]),
      start_date: "2026-03-01",
      end_date: "2026-03-04",
      page: "1",
    });
    expect(result.headers).toEqual(["campaign_id", "impressions", "spend"]);
    expect(result.rows).toEqual([
      ["c1", "100", "1.5"],
      ["c2", "50", "0.5"],
    ]);
    expect(result.totalRows).toBe(2);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("getReport pages until total_page and stops at maxRows", async () => {
    mockHttpClient.get
      .mockResolvedValueOnce({
        list: [{ dimensions: { ad_id: "a1" }, metrics: { clicks: "1" } }],
        page_info: { page: 1, total_number: 3, total_page: 3 },
      })
      .mockResolvedValueOnce({
        list: [{ dimensions: { ad_id: "a2" }, metrics: { clicks: "2" } }],
        page_info: { page: 2, total_number: 3, total_page: 3 },
      });

    const result = await service.getReport(
      {
        dimensions: ["ad_id"],
        metrics: ["clicks"],
        start_date: "2026-03-01",
        end_date: "2026-03-02",
      },
      2
    );

    expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
    expect(mockHttpClient.get.mock.calls[1][1]).toMatchObject({ page: "2", page_size: "2" });
    expect(result.rows).toEqual([
      ["a1", "1"],
      ["a2", "2"],
    ]);
    expect(result.totalRows).toBe(3);
  });

  it("checkReportStatus makes single GET and echoes the requested task id", async () => {
    // The spec's check response maps only status + message — no task_id.
    mockHttpClient.get.mockResolvedValueOnce({ status: "RUNNING" });

    const result = await service.checkReportStatus("task-456");

    expect(result.taskId).toBe("task-456");
    expect(result.status).toBe("RUNNING");
    expect(result.downloadUrl).toBeUndefined();
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      "/open_api/v1.3/report/task/check/",
      { task_id: "task-456" },
      undefined
    );
  });

  it("checkReportStatus surfaces TikTok's message and never invents a download URL", async () => {
    mockHttpClient.get.mockResolvedValueOnce({ status: "FAILED", message: "no data" });

    const result = await service.checkReportStatus("task-789");

    expect(result.status).toBe("FAILED");
    expect(result.message).toBe("no data");
    expect(result).not.toHaveProperty("downloadUrl");
  });

  describe("getReportDownloadUrl", () => {
    it("GETs report/task/download/ with the task id and returns the signed URL", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        output_format: "CSV_DOWNLOAD",
        file_name: "report_07_26.csv",
        download_url: "https://ads.tiktok.com/wsos_v2/statistics/object/abc?expire=1&sign=2",
      });

      const result = await service.getReportDownloadUrl("task-9");

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/open_api/v1.3/report/task/download/",
        { task_id: "task-9" },
        undefined
      );
      expect(result).toEqual({
        downloadUrl: "https://ads.tiktok.com/wsos_v2/statistics/object/abc?expire=1&sign=2",
        fileName: "report_07_26.csv",
      });
      expect(mockRateLimiter.consume).toHaveBeenCalledWith(REPORTING_KEY);
    });

    it("refuses an XLSX output, which this server cannot parse", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        output_format: "XLSX_DOWNLOAD",
        file_name: "r.xlsx",
        download_url: "https://ads.tiktok.com/wsos_v2/x.xlsx",
      });
      await expect(service.getReportDownloadUrl("task-9")).rejects.toThrow(/XLSX_DOWNLOAD/);
    });

    it("explains when TikTok returns no download_url (e.g. a task created as CSV_STRING)", async () => {
      mockHttpClient.get.mockResolvedValueOnce({});
      await expect(service.getReportDownloadUrl("task-9")).rejects.toThrow(
        /no download_url.*tiktok_submit_report/s
      );
    });
  });

  it("checkReportStatus consumes rate limiter once", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      status: "QUEUING",
      task_id: "task-rl",
    });

    await service.checkReportStatus("task-rl");

    expect(mockRateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith(REPORTING_KEY);
  });

  it("getReportBreakdowns appends breakdown dimensions", async () => {
    const getReportSpy = vi.spyOn(service, "getReport").mockResolvedValueOnce({
      headers: ["date", "country"],
      rows: [["2026-03-01", "US"]],
      totalRows: 1,
    });

    const result = await service.getReportBreakdowns(
      {
        dimensions: ["campaign_id"],
        metrics: ["impressions"],
        start_date: "2026-03-01",
        end_date: "2026-03-04",
      },
      ["country"]
    );

    expect(getReportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: ["campaign_id", "country"] }),
      expect.any(Number),
      undefined
    );
    expect(result.totalRows).toBe(1);
  });
});

describe("mapTikTokReportTaskStatus", () => {
  // TikTok's documented report/task/check statuses (v1.3):
  // QUEUING, PROCESSING, SUCCESS, FAILED, CANCELED.
  it.each([
    ["QUEUING", "pending"],
    ["PROCESSING", "running"],
    ["SUCCESS", "complete"],
    ["FAILED", "failed"],
    ["CANCELED", "failed"],
  ])("maps %s to %s", (raw, state) => {
    expect(mapTikTokReportTaskStatus({ status: raw }).state).toBe(state);
  });

  it("carries TikTok's failure reason", () => {
    expect(
      mapTikTokReportTaskStatus({ status: "FAILED", message: "bad dimensions" }).errors
    ).toEqual(["bad dimensions"]);
  });

  it("says a canceled task was canceled", () => {
    expect(mapTikTokReportTaskStatus({ status: "CANCELED" }).errors?.[0]).toMatch(/cancel/i);
  });

  it.each(["PENDING", "RUNNING", "DONE"])(
    "does not treat %s as a TikTok status: it was never one, and mapping it would hide a real mismatch",
    (raw) => {
      const result = mapTikTokReportTaskStatus({ status: raw });
      expect(result.state).toBe("failed");
      expect(result.errors?.[0]).toContain(`"${raw}"`);
    }
  );

  it("treats an unrecognized status as terminal and names it", () => {
    const result = mapTikTokReportTaskStatus({ status: "SOMETHING_NEW" });
    expect(result.state).toBe("failed");
    expect(result.errors?.[0]).toContain('"SOMETHING_NEW"');
  });

  it("treats a missing status as terminal, not pending", () => {
    expect(mapTikTokReportTaskStatus({}).state).toBe("failed");
  });
});
