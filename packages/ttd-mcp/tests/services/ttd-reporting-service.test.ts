import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtdReportingService, type TtdReportConfig } from "../../src/services/ttd/ttd-reporting-service.js";

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

function createMockHttpClient() {
  return {
    fetch: vi.fn().mockResolvedValue({}),
    partnerId: "test-partner",
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/** Standard report config for tests. */
function sampleReportConfig(): TtdReportConfig {
  return {
    ReportName: "Test Report",
    ReportScheduleType: "Once",
    ReportDateRange: "Last7Days",
    ReportDimensions: ["AdvertiserId"],
    ReportMetrics: ["Impressions", "Clicks"],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TtdReportingService", () => {
  let service: TtdReportingService;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });

    logger = createMockLogger();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    service = new TtdReportingService(rateLimiter, httpClient, logger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // runReport
  // ==========================================================================

  describe("runReport", () => {
    it("creates report schedule via POST to /myreports/reportschedule", async () => {
      const config = sampleReportConfig();

      // 1) Create schedule response
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });
      // 2) Poll response -- complete immediately
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Complete" }],
      });

      const resultPromise = service.runReport(config);
      await vi.runAllTimersAsync();
      await resultPromise;

      // First call is the schedule creation
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/myreports/reportschedule");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual(config);
    });

    it("polls for execution via POST to /myreports/reportexecution/query", async () => {
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Complete" }],
      });

      const resultPromise = service.runReport(sampleReportConfig());
      await vi.runAllTimersAsync();
      await resultPromise;

      // Second call is the poll
      const [path, , options] = httpClient.fetch.mock.calls[1];
      expect(path).toBe("/myreports/reportexecution/query");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.ReportScheduleIds).toEqual(["sched-1"]);
      expect(body.PageSize).toBe(1);
    });

    it("returns result when execution state is Complete", async () => {
      const execution = { ReportExecutionState: "Complete", SomeData: "value" };
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });
      httpClient.fetch.mockResolvedValueOnce({ Result: [execution] });

      const resultPromise = service.runReport(sampleReportConfig());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        reportScheduleId: "sched-1",
        execution,
      });
    });

    it("returns downloadUrl when ReportDeliveries present", async () => {
      const execution = {
        ReportExecutionState: "Complete",
        ReportDeliveries: [{ DownloadURL: "https://files.ttd.com/report.csv" }],
      };
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });
      httpClient.fetch.mockResolvedValueOnce({ Result: [execution] });

      const resultPromise = service.runReport(sampleReportConfig());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        reportScheduleId: "sched-1",
        execution,
        downloadUrl: "https://files.ttd.com/report.csv",
      });
    });

    it("throws when execution state is Failed", async () => {
      const execution = { ReportExecutionState: "Failed", ErrorMessage: "bad query" };
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });
      httpClient.fetch.mockResolvedValueOnce({ Result: [execution] });

      const resultPromise = service.runReport(sampleReportConfig());
      const errorPromise = resultPromise.catch((e: unknown) => e);
      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Report execution failed");
    });

    it("throws when polling times out (MAX_POLL_ATTEMPTS = 60)", async () => {
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });

      // All poll responses return "Pending" (never completes)
      httpClient.fetch.mockResolvedValue({
        Result: [{ ReportExecutionState: "Pending" }],
      });

      const resultPromise = service.runReport(sampleReportConfig());
      const errorPromise = resultPromise.catch((e: unknown) => e);

      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Report polling timed out");
      expect((error as Error).message).toContain("60");
    });

    it("calls rateLimiter.consume for each request", async () => {
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });
      // First poll: Pending, second poll: Complete
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Pending" }],
      });
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Complete" }],
      });

      const resultPromise = service.runReport(sampleReportConfig());
      await vi.runAllTimersAsync();
      await resultPromise;

      // 1 for runReport (schedule creation) + 2 for polls = 3 total
      expect(rateLimiter.consume).toHaveBeenCalledTimes(3);
      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });

    it("polls multiple times with delays between attempts", async () => {
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-1" });
      // 3 polls: Pending, Pending, Complete
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Pending" }],
      });
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Pending" }],
      });
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Complete" }],
      });

      const resultPromise = service.runReport(sampleReportConfig());
      await vi.runAllTimersAsync();
      await resultPromise;

      // 1 schedule creation + 3 polls = 4 fetch calls
      expect(httpClient.fetch).toHaveBeenCalledTimes(4);
    });
  });

  // ==========================================================================
  // createReportSchedule
  // ==========================================================================

  describe("createReportSchedule", () => {
    it("calls POST to /myreports/reportschedule and returns reportScheduleId", async () => {
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-new" });

      const result = await service.createReportSchedule(sampleReportConfig());

      expect(result).toEqual({ reportScheduleId: "sched-new" });
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/myreports/reportschedule");
      expect(options.method).toBe("POST");
    });

    it("consumes rate limiter once", async () => {
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-rl" });

      await service.createReportSchedule(sampleReportConfig());

      expect(rateLimiter.consume).toHaveBeenCalledTimes(1);
      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });

    it("does not poll or sleep", async () => {
      httpClient.fetch.mockResolvedValueOnce({ ReportScheduleId: "sched-fast" });

      await service.createReportSchedule(sampleReportConfig());

      // Only one fetch call (no polling)
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // checkReportExecution
  // ==========================================================================

  describe("checkReportExecution", () => {
    it("returns Pending state when execution is in progress", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Pending" }],
      });

      const result = await service.checkReportExecution("sched-1");

      expect(result.reportScheduleId).toBe("sched-1");
      expect(result.state).toBe("Pending");
      expect(result.downloadUrl).toBeUndefined();
    });

    it("returns Complete state with downloadUrl when deliveries present", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        Result: [
          {
            ReportExecutionState: "Complete",
            ReportDeliveries: [{ DownloadURL: "https://files.ttd.com/report.csv" }],
          },
        ],
      });

      const result = await service.checkReportExecution("sched-2");

      expect(result.state).toBe("Complete");
      expect(result.downloadUrl).toBe("https://files.ttd.com/report.csv");
      expect(result.execution).toHaveProperty("ReportExecutionState", "Complete");
    });

    it("returns Failed state", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Failed", ErrorMessage: "bad query" }],
      });

      const result = await service.checkReportExecution("sched-3");

      expect(result.state).toBe("Failed");
      expect(result.execution).toHaveProperty("ErrorMessage", "bad query");
    });

    it("returns Unknown state when no executions found", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [] });

      const result = await service.checkReportExecution("sched-4");

      expect(result.state).toBe("Unknown");
      expect(result.execution).toEqual({});
    });

    it("consumes rate limiter once per call", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Pending" }],
      });

      await service.checkReportExecution("sched-5");

      expect(rateLimiter.consume).toHaveBeenCalledTimes(1);
      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });

    it("makes exactly one HTTP call (no polling)", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ ReportExecutionState: "Pending" }],
      });

      await service.checkReportExecution("sched-6");

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
