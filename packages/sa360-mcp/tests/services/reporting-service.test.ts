import { describe, it, expect, vi, beforeEach } from "vitest";
import { SA360ReportingService } from "../../src/services/sa360-v2/reporting-service.js";

// ---------------------------------------------------------------------------
// Mock fetchWithTimeout at module level
// ---------------------------------------------------------------------------

const { mockFetchWithTimeout } = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchWithTimeout: mockFetchWithTimeout };
});

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
    fetch: vi.fn().mockResolvedValue({}),
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockAuthAdapter() {
  return {
    getAccessToken: vi.fn().mockResolvedValue("mock-token"),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SA360ReportingService", () => {
  let service: SA360ReportingService;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockV2HttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;
  let authAdapter: ReturnType<typeof createMockAuthAdapter>;

  beforeEach(() => {
    logger = createMockLogger();
    httpClient = createMockV2HttpClient();
    rateLimiter = createMockRateLimiter();
    authAdapter = createMockAuthAdapter();
    mockFetchWithTimeout.mockReset();
    service = new SA360ReportingService(logger, rateLimiter, httpClient, authAdapter);
  });

  // ==========================================================================
  // submitReport
  // ==========================================================================

  describe("submitReport", () => {
    it("calls POST /reports with correct body structure", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "report-123" });

      const result = await service.submitReport({
        reportType: "campaign",
        columns: [{ columnName: "impressions" }, { columnName: "clicks" }],
        timeRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
        reportScope: { agencyId: "agency-1", advertiserId: "adv-1" },
      });

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/reports");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.reportType).toBe("campaign");
      expect(body.columns).toHaveLength(2);
      expect(body.timeRange.startDate).toBe("2026-01-01");
      expect(body.reportScope.agencyId).toBe("agency-1");
      expect(result.id).toBe("report-123");
    });

    it("includes optional filters when provided", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "report-456" });

      await service.submitReport({
        reportType: "keyword",
        columns: [{ columnName: "impressions" }],
        timeRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
        reportScope: { agencyId: "agency-1" },
        filters: [{ column: { columnName: "status" }, operator: "equals", values: ["ACTIVE"] }],
        includeRemovedEntities: true,
      });

      const body = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(body.filters).toHaveLength(1);
      expect(body.includeRemovedEntities).toBe(true);
    });

    it("defaults statisticsCurrency to agency", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "report-789" });

      await service.submitReport({
        reportType: "campaign",
        columns: [{ columnName: "cost" }],
        timeRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
        reportScope: { agencyId: "agency-1" },
      });

      const body = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(body.statisticsCurrency).toBe("agency");
    });

    it("consumes rate limiter with reports key", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "report-1" });

      await service.submitReport({
        reportType: "campaign",
        columns: [{ columnName: "impressions" }],
        timeRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
        reportScope: { agencyId: "agency-1" },
      });

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360v2:reports");
    });

    it("propagates errors from httpClient", async () => {
      httpClient.fetch.mockRejectedValueOnce(new Error("API error: 500"));

      await expect(
        service.submitReport({
          reportType: "campaign",
          columns: [{ columnName: "impressions" }],
          timeRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
          reportScope: { agencyId: "agency-1" },
        })
      ).rejects.toThrow("API error: 500");
    });
  });

  // ==========================================================================
  // getReportStatus
  // ==========================================================================

  describe("getReportStatus", () => {
    it("calls GET /reports/{reportId}", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        id: "report-123",
        isReportReady: false,
      });

      const result = await service.getReportStatus("report-123");

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/reports/report-123");
      expect(result.isReportReady).toBe(false);
    });

    it("returns ready status with file URLs", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        id: "report-123",
        isReportReady: true,
        rowCount: 500,
        files: [{ url: "https://example.com/file0", byteCount: "1024" }],
      });

      const result = await service.getReportStatus("report-123");

      expect(result.isReportReady).toBe(true);
      expect(result.rowCount).toBe(500);
      expect(result.files).toHaveLength(1);
      expect(result.files![0].url).toBe("https://example.com/file0");
    });

    it("consumes rate limiter", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        id: "report-1",
        isReportReady: false,
      });

      await service.getReportStatus("report-1");

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360v2:reports");
    });

    it("propagates errors from httpClient", async () => {
      httpClient.fetch.mockRejectedValueOnce(new Error("API error: 404"));

      await expect(service.getReportStatus("bad-id")).rejects.toThrow("API error: 404");
    });
  });

  // ==========================================================================
  // downloadReport
  // ==========================================================================

  describe("downloadReport", () => {
    it("fetches download URL directly with auth header and returns CSV text", async () => {
      const csvData = "header1,header2\nval1,val2\n";
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(csvData),
      });

      const result = await service.downloadReport("https://example.com/file0");

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        "https://example.com/file0",
        60_000,
        undefined,
        { headers: { Authorization: "Bearer mock-token" } }
      );
      expect(result).toBe(csvData);
    });

    it("throws on non-ok response", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(service.downloadReport("https://example.com/file0")).rejects.toThrow(
        "Failed to download SA360 report: 404 Not Found"
      );
    });

    it("consumes rate limiter", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(""),
      });

      await service.downloadReport("https://example.com/file0");

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360v2:reports");
    });

    it("propagates fetch errors", async () => {
      mockFetchWithTimeout.mockRejectedValueOnce(new Error("Network error"));

      await expect(service.downloadReport("https://example.com/bad")).rejects.toThrow(
        "Network error"
      );
    });
  });
});
