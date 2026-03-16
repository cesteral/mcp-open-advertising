import { describe, it, expect, vi, beforeEach } from "vitest";
import { SA360ReportingService } from "../../src/services/sa360-v2/reporting-service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

function createMockV2HttpClient() {
  return {
    fetch: vi.fn(),
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ---------------------------------------------------------------------------
// Integration: submit → check → download
// ---------------------------------------------------------------------------

describe("Async Reporting Workflow", () => {
  let service: SA360ReportingService;
  let httpClient: ReturnType<typeof createMockV2HttpClient>;

  beforeEach(() => {
    const logger = createMockLogger();
    httpClient = createMockV2HttpClient();
    const rateLimiter = createMockRateLimiter();
    service = new SA360ReportingService(logger, rateLimiter, httpClient);
  });

  it("completes full submit → check → download workflow", async () => {
    // Step 1: Submit report
    httpClient.fetch.mockResolvedValueOnce({ id: "report-abc" });

    const submitResult = await service.submitReport({
      reportType: "campaign",
      columns: [{ columnName: "campaign" }, { columnName: "impressions" }, { columnName: "clicks" }],
      timeRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      reportScope: { agencyId: "agency-1", advertiserId: "adv-1" },
    });

    expect(submitResult.id).toBe("report-abc");

    // Step 2: Check status — not ready
    httpClient.fetch.mockResolvedValueOnce({
      id: "report-abc",
      isReportReady: false,
    });

    const pendingStatus = await service.getReportStatus("report-abc");
    expect(pendingStatus.isReportReady).toBe(false);

    // Step 3: Check status — ready
    httpClient.fetch.mockResolvedValueOnce({
      id: "report-abc",
      isReportReady: true,
      rowCount: 3,
      files: [{ url: "https://example.com/reports/abc/files/0", byteCount: "256" }],
    });

    const readyStatus = await service.getReportStatus("report-abc");
    expect(readyStatus.isReportReady).toBe(true);
    expect(readyStatus.files).toHaveLength(1);
    expect(readyStatus.rowCount).toBe(3);

    // Step 4: Download report
    const csvData = "campaign,impressions,clicks\nCampaign A,1000,50\nCampaign B,2000,100\nCampaign C,500,25\n";
    httpClient.fetch.mockResolvedValueOnce(csvData);

    const downloadResult = await service.downloadReport(readyStatus.files![0].url);
    expect(downloadResult).toBe(csvData);

    // Verify total API calls: submit (1) + check (2) + download (1) = 4
    expect(httpClient.fetch).toHaveBeenCalledTimes(4);
  });

  it("handles report that fails on status check", async () => {
    httpClient.fetch.mockResolvedValueOnce({ id: "report-fail" });

    await service.submitReport({
      reportType: "campaign",
      columns: [{ columnName: "impressions" }],
      timeRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      reportScope: { agencyId: "agency-1" },
    });

    httpClient.fetch.mockRejectedValueOnce(new Error("API error: report expired"));

    await expect(service.getReportStatus("report-fail")).rejects.toThrow("report expired");
  });
});
