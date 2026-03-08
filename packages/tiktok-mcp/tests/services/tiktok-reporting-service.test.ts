import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { TikTokReportingService } from "../../src/services/tiktok/tiktok-reporting-service.js";

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

  it("pollReport returns DONE result", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      status: "DONE",
      task_id: "task-123",
      download_url: "https://example.com/report.csv",
    });

    const result = await service.pollReport("task-123");
    expect(result.status).toBe("DONE");
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
    mockHttpClient.post.mockResolvedValueOnce({ task_id: "task-xyz" });
    mockHttpClient.get.mockResolvedValueOnce({
      status: "DONE",
      task_id: "task-xyz",
      download_url: "https://example.com/task-xyz.csv",
    });
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      text: async () => "date,impressions\n2026-03-01,100",
    } as unknown as Response);

    const result = await service.getReport({
      dimensions: ["campaign_id"],
      metrics: ["impressions"],
      start_date: "2026-03-01",
      end_date: "2026-03-04",
    });

    expect(result.taskId).toBe("task-xyz");
    expect(result.rows).toHaveLength(1);
  });

  it("checkReportStatus makes single GET and returns status", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      status: "RUNNING",
      task_id: "task-456",
    });

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

  it("checkReportStatus returns downloadUrl when DONE", async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      status: "DONE",
      task_id: "task-789",
      download_url: "https://example.com/done-report.csv",
    });

    const result = await service.checkReportStatus("task-789");

    expect(result.status).toBe("DONE");
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
      taskId: "task-bd",
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
      undefined
    );
    expect(result.taskId).toBe("task-bd");
  });
});
