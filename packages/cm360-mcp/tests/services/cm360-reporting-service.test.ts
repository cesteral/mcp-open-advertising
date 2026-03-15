import { describe, it, expect, vi, beforeEach } from "vitest";
import { CM360ReportingService } from "../../src/services/cm360/cm360-reporting-service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}

function createMockHttpClient() {
  return {
    fetch: vi.fn().mockResolvedValue({}),
    fetchRaw: vi.fn().mockResolvedValue({}),
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CM360ReportingService", () => {
  let service: CM360ReportingService;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    logger = createMockLogger();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    // Use short poll intervals and max 3 attempts for fast tests
    service = new CM360ReportingService(rateLimiter, httpClient, logger, 10, 3);
  });

  // ==========================================================================
  // createReport (non-blocking submit)
  // ==========================================================================

  describe("createReport", () => {
    it("creates report then runs it", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ id: "report-1" }) // POST create
        .mockResolvedValueOnce({ id: "file-1" }); // POST run

      const result = await service.createReport("12345", {
        name: "Test Report",
        type: "STANDARD",
      });

      expect(result.reportId).toBe("report-1");
      expect(result.fileId).toBe("file-1");

      // Verify two calls: create + run
      expect(httpClient.fetch).toHaveBeenCalledTimes(2);

      const [createPath, , createOpts] = httpClient.fetch.mock.calls[0];
      expect(createPath).toBe("/userprofiles/12345/reports");
      expect(createOpts.method).toBe("POST");
      expect(JSON.parse(createOpts.body)).toEqual({
        name: "Test Report",
        type: "STANDARD",
      });

      const [runPath, , runOpts] = httpClient.fetch.mock.calls[1];
      expect(runPath).toBe("/userprofiles/12345/reports/report-1/run");
      expect(runOpts.method).toBe("POST");
    });

    it("consumes rate limiter twice (create + run)", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ id: "report-1" })
        .mockResolvedValueOnce({ id: "file-1" });

      await service.createReport("12345", { name: "Test", type: "STANDARD" });

      expect(rateLimiter.consume).toHaveBeenCalledTimes(2);
      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });

    it("passes request context through", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ id: "report-1" })
        .mockResolvedValueOnce({ id: "file-1" });

      const context = { requestId: "req-42" };
      await service.createReport("12345", { name: "Test", type: "STANDARD" }, context);

      const [, ctx1] = httpClient.fetch.mock.calls[0];
      const [, ctx2] = httpClient.fetch.mock.calls[1];
      expect(ctx1).toEqual(context);
      expect(ctx2).toEqual(context);
    });
  });

  // ==========================================================================
  // checkReportFile
  // ==========================================================================

  describe("checkReportFile", () => {
    it("fetches file status from correct path", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        status: "PROCESSING",
      });

      const result = await service.checkReportFile("12345", "report-1", "file-1");

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/reports/report-1/files/file-1");
      expect(result.status).toBe("PROCESSING");
      expect(result.reportId).toBe("report-1");
      expect(result.fileId).toBe("file-1");
    });

    it("returns downloadUrl when report is available", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        status: "REPORT_AVAILABLE",
        urls: { apiUrl: "https://example.com/download" },
      });

      const result = await service.checkReportFile("12345", "report-1", "file-1");

      expect(result.status).toBe("REPORT_AVAILABLE");
      expect(result.downloadUrl).toBe("https://example.com/download");
    });

    it("returns undefined downloadUrl when still processing", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        status: "PROCESSING",
      });

      const result = await service.checkReportFile("12345", "report-1", "file-1");

      expect(result.downloadUrl).toBeUndefined();
    });

    it("defaults status to PROCESSING when missing", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.checkReportFile("12345", "report-1", "file-1");

      expect(result.status).toBe("PROCESSING");
    });

    it("consumes rate limiter", async () => {
      httpClient.fetch.mockResolvedValueOnce({ status: "PROCESSING" });

      await service.checkReportFile("12345", "report-1", "file-1");

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });
  });

  // ==========================================================================
  // runReport (blocking with polling)
  // ==========================================================================

  describe("runReport", () => {
    it("creates, runs, and polls until REPORT_AVAILABLE", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ id: "report-1" }) // create
        .mockResolvedValueOnce({ id: "file-1" }) // run
        .mockResolvedValueOnce({ status: "PROCESSING" }) // poll 1
        .mockResolvedValueOnce({
          status: "REPORT_AVAILABLE",
          urls: { apiUrl: "https://example.com/download" },
        }); // poll 2

      const result = (await service.runReport("12345", {
        name: "Test",
        type: "STANDARD",
      })) as Record<string, unknown>;

      expect(result.reportId).toBe("report-1");
      expect(result.fileId).toBe("file-1");
      expect(result.downloadUrl).toBe("https://example.com/download");
      expect(httpClient.fetch).toHaveBeenCalledTimes(4);
    });

    it("throws on FAILED status during polling", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ id: "report-1" })
        .mockResolvedValueOnce({ id: "file-1" })
        .mockResolvedValueOnce({ status: "FAILED" });

      await expect(
        service.runReport("12345", { name: "Test", type: "STANDARD" })
      ).rejects.toThrow("CM360 report failed");
    });

    it("throws on CANCELLED status during polling", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ id: "report-1" })
        .mockResolvedValueOnce({ id: "file-1" })
        .mockResolvedValueOnce({ status: "CANCELLED" });

      await expect(
        service.runReport("12345", { name: "Test", type: "STANDARD" })
      ).rejects.toThrow("CM360 report cancelled");
    });

    it("throws on polling timeout", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ id: "report-1" })
        .mockResolvedValueOnce({ id: "file-1" })
        .mockResolvedValue({ status: "PROCESSING" }); // all polls return PROCESSING

      await expect(
        service.runReport("12345", { name: "Test", type: "STANDARD" })
      ).rejects.toThrow("CM360 report polling timed out after 3 attempts");
    });
  });

  // ==========================================================================
  // downloadReportFile
  // ==========================================================================

  describe("downloadReportFile", () => {
    it("delegates to httpClient.fetchRaw", async () => {
      const response = { ok: true, text: vi.fn().mockResolvedValue("csv data") } as any;
      httpClient.fetchRaw.mockResolvedValueOnce(response);

      const result = await service.downloadReportFile("https://example.com/download");

      expect(httpClient.fetchRaw).toHaveBeenCalledTimes(1);
      const [url, timeout, context, opts] = httpClient.fetchRaw.mock.calls[0];
      expect(url).toBe("https://example.com/download");
      expect(timeout).toBe(30_000);
      expect(opts.method).toBe("GET");
      expect(result).toBe(response);
    });

    it("uses custom timeout", async () => {
      httpClient.fetchRaw.mockResolvedValueOnce({ ok: true } as any);

      await service.downloadReportFile("https://example.com/download", 60_000);

      const [, timeout] = httpClient.fetchRaw.mock.calls[0];
      expect(timeout).toBe(60_000);
    });

    it("passes request context", async () => {
      httpClient.fetchRaw.mockResolvedValueOnce({ ok: true } as any);
      const context = { requestId: "req-99" };

      await service.downloadReportFile("https://example.com/download", 30_000, context);

      const [, , ctx] = httpClient.fetchRaw.mock.calls[0];
      expect(ctx).toEqual(context);
    });
  });
});
