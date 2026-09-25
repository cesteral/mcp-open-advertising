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
  post: vi.fn(),
  get: vi.fn(),
};

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

  it("pollReport returns DONE result", async () => {
    mockHttpClient.get.mockResolvedValueOnce({ status: "DONE" });

    const result = await service.pollReport("task-123");
    expect(result.status).toBe("DONE");
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

  it("checkReportStatus surfaces a download_url and message when TikTok returns them", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      status: "DONE",
      message: "ok",
      download_url: "https://example.com/done-report.csv",
    });

    const result = await service.checkReportStatus("task-789");

    expect(result.status).toBe("DONE");
    expect(result.message).toBe("ok");
    expect(result.downloadUrl).toBe("https://example.com/done-report.csv");
  });

  it("checkReportStatus consumes rate limiter once", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      status: "PENDING",
      task_id: "task-rl",
    });

    await service.checkReportStatus("task-rl");

    expect(mockRateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(mockRateLimiter.consume).toHaveBeenCalledWith("tiktok:reporting");
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
  it.each([
    ["PENDING", "pending"],
    ["RUNNING", "running"],
    ["DONE", "complete"],
    ["FAILED", "failed"],
  ])("maps %s to %s", (raw, state) => {
    expect(mapTikTokReportTaskStatus({ status: raw }).state).toBe(state);
  });

  it("treats an unrecognized status as terminal and names it", () => {
    const result = mapTikTokReportTaskStatus({ status: "QUEUING" });
    expect(result.state).toBe("failed");
    expect(result.errors?.[0]).toContain('"QUEUING"');
  });

  it("treats a missing status as terminal, not pending", () => {
    expect(mapTikTokReportTaskStatus({}).state).toBe("failed");
  });
});
