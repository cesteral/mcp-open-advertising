import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppConfig } from "../../src/config/index.js";

// ---------------------------------------------------------------------------
// Mocks -- must be defined before importing the service under test
// ---------------------------------------------------------------------------

vi.mock("../../src/services/bid-manager/report-parser.js", () => ({
  csvToJson: vi.fn().mockReturnValue([
    { impressions: "1000", clicks: "50" },
    { impressions: "2000", clicks: "100" },
  ]),
  parseCSVToDeliveryMetrics: vi.fn().mockReturnValue({
    impressions: 10000,
    clicks: 200,
    spend: 500,
    conversions: 50,
    revenue: 1000,
  }),
  parseCSVToHistoricalData: vi.fn().mockReturnValue([
    {
      date: "2024-01-01",
      metrics: {
        impressions: 5000,
        clicks: 100,
        spend: 250,
        conversions: 25,
        revenue: 500,
      },
    },
  ]),
  calculatePerformanceMetrics: vi.fn().mockReturnValue({
    impressions: 10000,
    clicks: 200,
    spend: 500,
    conversions: 50,
    revenue: 1000,
    cpm: 50,
    ctr: 2,
    cpc: 2.5,
    cpa: 10,
    roas: 2,
  }),
}));

vi.mock("../../src/utils/math.js", () => ({
  safeDivide: vi
    .fn()
    .mockImplementation((a: number, b: number, fallback: number) => (b === 0 ? fallback : a / b)),
  round: vi.fn().mockImplementation((v: number, d: number) => Number(v.toFixed(d))),
}));

// Import after mocks
import { BidManagerService } from "../../src/services/bid-manager/BidManagerService.js";
import {
  QueryCreationError,
  QueryExecutionError,
  ReportGenerationError,
  ReportTimeoutError,
  ReportFetchError,
  RetryExhaustedError,
  BidManagerError,
} from "../../src/utils/errors/index.js";
import {
  parseCSVToDeliveryMetrics,
  calculatePerformanceMetrics,
} from "../../src/services/bid-manager/report-parser.js";

// ---------------------------------------------------------------------------
// Helpers
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

function createMockConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    reportPollInitialDelayMs: 100,
    reportPollMaxDelayMs: 1000,
    reportPollMaxRetries: 3,
    reportQueryRetries: 2,
    reportRetryCooldownMs: 100,
    ...overrides,
  } as any;
}

function createMockClient() {
  return {
    queries: {
      create: vi.fn(),
      run: vi.fn(),
      reports: {
        get: vi.fn(),
      },
    },
  } as any;
}

function createQuerySpec() {
  return {
    metadata: {
      title: "Test Query",
      dataRange: {
        range: "CUSTOM_DATES" as const,
        customStartDate: { year: 2024, month: 1, day: 1 },
        customEndDate: { year: 2024, month: 1, day: 31 },
      },
      format: "CSV" as const,
    },
    params: {
      type: "STANDARD" as const,
      groupBys: ["FILTER_DATE" as const, "FILTER_MEDIA_PLAN" as const],
      metrics: ["METRIC_IMPRESSIONS" as const, "METRIC_CLICKS" as const],
      filters: [
        { type: "FILTER_ADVERTISER" as const, value: "adv-123" },
        { type: "FILTER_MEDIA_PLAN" as const, value: "camp-456" },
      ],
    },
  };
}

/**
 * Run an async operation that involves polling sleeps with fake timers.
 * Starts the promise, then advances timers until it resolves or rejects.
 */
async function withAdvancedTimers<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  for (let i = 0; i < 40; i++) {
    await vi.advanceTimersByTimeAsync(500);
  }
  return promise;
}

/**
 * Set up the full query lifecycle mocks for end-to-end tests
 * (create -> run -> poll DONE -> fetch CSV)
 */
function setupFullLifecycleMocks(
  client: ReturnType<typeof createMockClient>,
  gcsPath = "https://storage.googleapis.com/bucket/report.csv"
) {
  client.queries.create.mockResolvedValue({
    data: { queryId: "q-lifecycle" },
  });
  client.queries.run.mockResolvedValue({
    data: { key: { reportId: "r-lifecycle" } },
  });
  client.queries.reports.get.mockResolvedValue({
    data: {
      metadata: {
        status: { state: "DONE", format: "CSV" },
        googleCloudStoragePath: gcsPath,
      },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "csv,data\n1,2",
    })
  );
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("BidManagerService", () => {
  let service: BidManagerService;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockConfig: AppConfig;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    mockConfig = createMockConfig();
    mockClient = createMockClient();
    service = new BidManagerService(mockConfig, mockLogger, mockClient);

    // Default global fetch mock
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "csv,data\n1,2",
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // Use clearAllMocks instead of restoreAllMocks to preserve vi.mock factory return values
    vi.clearAllMocks();
  });

  // =========================================================================
  // createQuery
  // =========================================================================

  describe("createQuery", () => {
    it("creates query and returns queryId", async () => {
      mockClient.queries.create.mockResolvedValue({
        data: { queryId: "q-123" },
      });

      const result = await service.createQuery(createQuerySpec());

      expect(result).toEqual({ queryId: "q-123" });
      expect(mockClient.queries.create).toHaveBeenCalledOnce();
    });

    it("throws QueryCreationError when no queryId returned", async () => {
      mockClient.queries.create.mockResolvedValue({
        data: { queryId: undefined },
      });

      await expect(service.createQuery(createQuerySpec())).rejects.toThrow(QueryCreationError);
    });

    it("throws QueryCreationError on API error", async () => {
      mockClient.queries.create.mockRejectedValue(new Error("API unavailable"));

      await expect(service.createQuery(createQuerySpec())).rejects.toThrow(QueryCreationError);
    });
  });

  // =========================================================================
  // runQuery
  // =========================================================================

  describe("runQuery", () => {
    it("runs query and returns reportId", async () => {
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-456" } },
      });

      const result = await service.runQuery("q-123");

      expect(result).toEqual({ reportId: "r-456" });
      expect(mockClient.queries.run).toHaveBeenCalledWith({
        queryId: "q-123",
      });
    });

    it("throws QueryExecutionError when no reportId returned", async () => {
      mockClient.queries.run.mockResolvedValue({
        data: { key: {} },
      });

      await expect(service.runQuery("q-123")).rejects.toThrow(QueryExecutionError);
    });

    it("throws QueryExecutionError on API error", async () => {
      mockClient.queries.run.mockRejectedValue(new Error("API error"));

      await expect(service.runQuery("q-123")).rejects.toThrow(QueryExecutionError);
    });
  });

  // =========================================================================
  // getReportStatus
  // =========================================================================

  describe("getReportStatus", () => {
    it("returns report metadata with status and GCS path", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "DONE", format: "CSV" },
            googleCloudStoragePath: "gs://bucket/report.csv",
          },
        },
      });

      const result = await service.getReportStatus("q-123", "r-456");

      expect(result).toEqual({
        status: { state: "DONE", format: "CSV" },
        googleCloudStoragePath: "gs://bucket/report.csv",
      });
    });

    it("defaults state to QUEUED when not provided", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: { metadata: { status: {} } },
      });

      const result = await service.getReportStatus("q-123", "r-456");

      expect(result.status.state).toBe("QUEUED");
    });

    it("throws BidManagerError on API error", async () => {
      mockClient.queries.reports.get.mockRejectedValue({
        code: 404,
        message: "Not found",
      });

      await expect(service.getReportStatus("q-123", "r-456")).rejects.toThrow(BidManagerError);
    });
  });

  // =========================================================================
  // pollForCompletion
  // =========================================================================

  describe("pollForCompletion", () => {
    it("returns immediately when report is DONE", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "DONE", format: "CSV" },
            googleCloudStoragePath: "gs://bucket/report.csv",
          },
        },
      });

      const result = await withAdvancedTimers(() => service.pollForCompletion("q-123", "r-456"));

      expect(result.status.state).toBe("DONE");
      expect(result.googleCloudStoragePath).toBe("gs://bucket/report.csv");
      expect(mockClient.queries.reports.get).toHaveBeenCalledTimes(1);
    });

    it("throws ReportGenerationError when report FAILED", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "FAILED", format: "CSV" },
          },
        },
      });

      const promise = service.pollForCompletion("q-123", "r-456");
      // Register the rejection handler BEFORE advancing timers
      const assertion = expect(promise).rejects.toThrow(ReportGenerationError);
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(500);
      }
      await assertion;
    });

    it("throws ReportTimeoutError after maxRetries", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "RUNNING" },
          },
        },
      });

      const promise = service.pollForCompletion("q-123", "r-456", {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      });

      // Register the rejection handler BEFORE advancing timers
      // to prevent "unhandled rejection" warnings
      const assertion = expect(promise).rejects.toThrow(ReportTimeoutError);

      // Advance timers enough to cover all sleep calls between attempts
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(500);
      }

      await assertion;
      expect(mockClient.queries.reports.get).toHaveBeenCalledTimes(3);
    });

    it("polls multiple times before succeeding", async () => {
      mockClient.queries.reports.get
        .mockResolvedValueOnce({
          data: { metadata: { status: { state: "QUEUED" } } },
        })
        .mockResolvedValueOnce({
          data: { metadata: { status: { state: "RUNNING" } } },
        })
        .mockResolvedValueOnce({
          data: {
            metadata: {
              status: { state: "DONE", format: "CSV" },
              googleCloudStoragePath: "gs://bucket/report.csv",
            },
          },
        });

      const promise = service.pollForCompletion("q-123", "r-456", {
        maxRetries: 5,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      });

      // Advance past sleep calls
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(500);
      }

      const result = await promise;

      expect(result.status.state).toBe("DONE");
      expect(mockClient.queries.reports.get).toHaveBeenCalledTimes(3);
    });

    it("retries on transient errors during polling", async () => {
      mockClient.queries.reports.get
        .mockRejectedValueOnce({ code: 500, message: "Server Error" })
        .mockResolvedValueOnce({
          data: {
            metadata: {
              status: { state: "DONE", format: "CSV" },
              googleCloudStoragePath: "gs://bucket/report.csv",
            },
          },
        });

      const promise = service.pollForCompletion("q-123", "r-456", {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      });

      // Advance past sleep for first failed attempt
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(500);
      }

      const result = await promise;

      expect(result.status.state).toBe("DONE");
      expect(mockClient.queries.reports.get).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // continueQuery
  // =========================================================================

  describe("continueQuery", () => {
    it("returns existing reportId when status is DONE", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "DONE" },
            googleCloudStoragePath: "gs://bucket/report.csv",
          },
        },
      });

      const result = await service.continueQuery("q-123", "r-456");

      expect(result).toEqual({ reportId: "r-456", isNewRun: false });
      expect(mockClient.queries.run).not.toHaveBeenCalled();
    });

    it("returns existing reportId when status is RUNNING", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: { metadata: { status: { state: "RUNNING" } } },
      });

      const result = await service.continueQuery("q-123", "r-456");

      expect(result).toEqual({ reportId: "r-456", isNewRun: false });
    });

    it("returns existing reportId when status is QUEUED", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: { metadata: { status: { state: "QUEUED" } } },
      });

      const result = await service.continueQuery("q-123", "r-456");

      expect(result).toEqual({ reportId: "r-456", isNewRun: false });
    });

    it("re-runs query when status is FAILED", async () => {
      mockClient.queries.reports.get.mockResolvedValue({
        data: { metadata: { status: { state: "FAILED" } } },
      });
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-new" } },
      });

      const result = await service.continueQuery("q-123", "r-456");

      expect(result).toEqual({ reportId: "r-new", isNewRun: true });
      expect(mockClient.queries.run).toHaveBeenCalledWith({
        queryId: "q-123",
      });
    });

    it("re-runs when getReportStatus throws", async () => {
      mockClient.queries.reports.get.mockRejectedValue(new Error("Not found"));
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-new" } },
      });

      const result = await service.continueQuery("q-123", "r-456");

      expect(result).toEqual({ reportId: "r-new", isNewRun: true });
    });

    it("runs query when no reportId provided", async () => {
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-first" } },
      });

      const result = await service.continueQuery("q-123");

      expect(result).toEqual({ reportId: "r-first", isNewRun: true });
      expect(mockClient.queries.reports.get).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // executeQueryWithRetry
  // =========================================================================

  describe("executeQueryWithRetry", () => {
    it("full lifecycle: create -> run -> poll -> returns GCS path", async () => {
      mockClient.queries.create.mockResolvedValue({
        data: { queryId: "q-123" },
      });
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-456" } },
      });
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "DONE", format: "CSV" },
            googleCloudStoragePath: "gs://bucket/report.csv",
          },
        },
      });

      const result = await withAdvancedTimers(() =>
        service.executeQueryWithRetry(createQuerySpec(), {
          maxRetries: 2,
          retryCooldownMs: 100,
          backoffConfig: {
            maxRetries: 3,
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
          },
        })
      );

      expect(result).toEqual({
        gcsPath: "gs://bucket/report.csv",
        queryId: "q-123",
        reportId: "r-456",
      });
      expect(mockClient.queries.create).toHaveBeenCalledOnce();
      expect(mockClient.queries.run).toHaveBeenCalledOnce();
    });

    it("retries on failure up to maxRetries", async () => {
      mockClient.queries.create.mockResolvedValue({
        data: { queryId: "q-123" },
      });

      // First attempt: run succeeds, poll returns FAILED
      // continueQuery on retry: sees FAILED, re-runs
      // Second attempt: poll returns DONE
      let pollCallCount = 0;
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-456" } },
      });
      mockClient.queries.reports.get.mockImplementation(async () => {
        pollCallCount++;
        if (pollCallCount <= 2) {
          // First pollForCompletion attempt and continueQuery check both see FAILED
          return {
            data: { metadata: { status: { state: "FAILED" } } },
          };
        }
        // Second lifecycle attempt: DONE
        return {
          data: {
            metadata: {
              status: { state: "DONE", format: "CSV" },
              googleCloudStoragePath: "gs://bucket/report.csv",
            },
          },
        };
      });

      const promise = service.executeQueryWithRetry(createQuerySpec(), {
        maxRetries: 3,
        retryCooldownMs: 50,
        backoffConfig: {
          maxRetries: 1,
          initialDelayMs: 50,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });

      // Advance timers to cover cooldown between retries
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      const result = await promise;
      expect(result).toEqual({
        gcsPath: "gs://bucket/report.csv",
        queryId: "q-123",
        reportId: "r-456",
      });
    });

    it("throws RetryExhaustedError after all retries", async () => {
      mockClient.queries.create.mockResolvedValue({
        data: { queryId: "q-123" },
      });
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-456" } },
      });
      // Always FAILED so pollForCompletion always throws ReportGenerationError
      mockClient.queries.reports.get.mockResolvedValue({
        data: { metadata: { status: { state: "FAILED" } } },
      });

      const promise = service.executeQueryWithRetry(createQuerySpec(), {
        maxRetries: 2,
        retryCooldownMs: 50,
        backoffConfig: {
          maxRetries: 1,
          initialDelayMs: 50,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });

      // Register the rejection handler BEFORE advancing timers
      const assertion = expect(promise).rejects.toThrow(RetryExhaustedError);

      // Advance timers generously to cover all retries and cooldowns
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await assertion;
    });

    it("throws RetryExhaustedError when no GCS path in completed report", async () => {
      mockClient.queries.create.mockResolvedValue({
        data: { queryId: "q-123" },
      });
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-456" } },
      });
      // DONE but without googleCloudStoragePath
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "DONE", format: "CSV" },
          },
        },
      });

      const promise = service.executeQueryWithRetry(createQuerySpec(), {
        maxRetries: 1,
        retryCooldownMs: 50,
        backoffConfig: {
          maxRetries: 1,
          initialDelayMs: 50,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });

      // Register the rejection handler BEFORE advancing timers
      const assertion = expect(promise).rejects.toThrow(RetryExhaustedError);

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await assertion;
    });
  });

  // =========================================================================
  // fetchReportData
  // =========================================================================

  describe("fetchReportData", () => {
    it("fetches data from GCS path", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => "header1,header2\nvalue1,value2",
        })
      );

      const result = await service.fetchReportData(
        "https://storage.googleapis.com/bucket/report.csv"
      );

      expect(result).toBe("header1,header2\nvalue1,value2");
      expect(fetch).toHaveBeenCalledWith("https://storage.googleapis.com/bucket/report.csv");
    });

    it("throws ReportFetchError on HTTP error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          statusText: "Forbidden",
        })
      );

      await expect(service.fetchReportData("https://example.com/report.csv")).rejects.toThrow(
        ReportFetchError
      );
    });

    it("throws ReportFetchError on network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network timeout")));

      await expect(service.fetchReportData("https://example.com/report.csv")).rejects.toThrow(
        ReportFetchError
      );
    });
  });

  // =========================================================================
  // getDeliveryMetrics
  // =========================================================================

  describe("getDeliveryMetrics", () => {
    it("builds correct query spec, executes, and returns parsed metrics", async () => {
      setupFullLifecycleMocks(mockClient);

      const result = await withAdvancedTimers(() =>
        service.getDeliveryMetrics({
          advertiserId: "adv-123",
          campaignId: "camp-456",
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        })
      );

      // parseCSVToDeliveryMetrics is mocked to return the standard delivery metrics
      expect(result).toEqual({
        impressions: 10000,
        clicks: 200,
        spend: 500,
        conversions: 50,
        revenue: 1000,
      });

      // Verify the query spec was built correctly
      const createCall = mockClient.queries.create.mock.calls[0][0];
      expect(createCall.requestBody.metadata.title).toContain("camp-456");
      expect(createCall.requestBody.metadata.dataRange.range).toBe("CUSTOM_DATES");
      expect(createCall.requestBody.params.filters).toEqual(
        expect.arrayContaining([
          { type: "FILTER_ADVERTISER", value: "adv-123" },
          { type: "FILTER_MEDIA_PLAN", value: "camp-456" },
        ])
      );

      // Verify parseCSVToDeliveryMetrics was called with the CSV data
      expect(parseCSVToDeliveryMetrics).toHaveBeenCalledWith("csv,data\n1,2");
    });
  });

  // =========================================================================
  // getPacingStatus
  // =========================================================================

  describe("getPacingStatus", () => {
    it("calculates ON_PACE status", async () => {
      // Flight: Jan 1 - Jan 31 (31 days total)
      // Today: Jan 16 => effectiveEndDate = 2024-01-16
      // daysPassed = daysBetween(Jan 1, Jan 16) + 1 = 15 + 1 = 16
      // totalDays = daysBetween(Jan 1, Jan 31) + 1 = 30 + 1 = 31
      // expected = 16/31 * 100 = 51.61%
      // spend = 500, budget = 1000 => actual = 50%
      // ratio = 50 / 51.61 = 0.969 => ON_PACE (0.95-1.05)
      vi.setSystemTime(new Date("2024-01-16T12:00:00Z"));

      setupFullLifecycleMocks(mockClient);
      // Mock returns spend=500 from delivery metrics
      (parseCSVToDeliveryMetrics as any).mockReturnValue({
        impressions: 10000,
        clicks: 200,
        spend: 500,
        conversions: 50,
        revenue: 1000,
      });

      const result = await withAdvancedTimers(() =>
        service.getPacingStatus({
          advertiserId: "adv-123",
          campaignId: "camp-456",
          budgetTotal: 1000,
          flightStartDate: "2024-01-01",
          flightEndDate: "2024-01-31",
        })
      );

      expect(result.advertiserId).toBe("adv-123");
      expect(result.campaignId).toBe("camp-456");
      expect(result.budgetTotal).toBe(1000);
      expect(result.spendToDate).toBe(500);
      expect(result.status).toBe("ON_PACE");
    });

    it("calculates AHEAD status when over-delivering", async () => {
      // Flight: Jan 1 - Jan 31 (31 days)
      // Today: Jan 10 => effectiveEndDate = 2024-01-10
      // daysPassed = daysBetween(Jan 1, Jan 10) + 1 = 9 + 1 = 10
      // totalDays = 31
      // expected = 10/31 * 100 = 32.26%
      // spend = 800, budget = 1000 => actual = 80%
      // ratio = 80 / 32.26 = 2.48 => AHEAD (> 1.05)
      vi.setSystemTime(new Date("2024-01-10T12:00:00Z"));

      setupFullLifecycleMocks(mockClient);
      (parseCSVToDeliveryMetrics as any).mockReturnValue({
        impressions: 10000,
        clicks: 200,
        spend: 800,
        conversions: 50,
        revenue: 1000,
      });

      const result = await withAdvancedTimers(() =>
        service.getPacingStatus({
          advertiserId: "adv-123",
          campaignId: "camp-456",
          budgetTotal: 1000,
          flightStartDate: "2024-01-01",
          flightEndDate: "2024-01-31",
        })
      );

      expect(result.status).toBe("AHEAD");
    });

    it("calculates BEHIND status when under-delivering", async () => {
      // Flight: Jan 1 - Jan 31 (31 days)
      // Today: Jan 20 => effectiveEndDate = 2024-01-20
      // daysPassed = daysBetween(Jan 1, Jan 20) + 1 = 19 + 1 = 20
      // totalDays = 31
      // expected = 20/31 * 100 = 64.52%
      // spend = 550, budget = 1000 => actual = 55%
      // ratio = 55 / 64.52 = 0.852 => BEHIND (>= 0.8 and < 0.95)
      vi.setSystemTime(new Date("2024-01-20T12:00:00Z"));

      setupFullLifecycleMocks(mockClient);
      (parseCSVToDeliveryMetrics as any).mockReturnValue({
        impressions: 10000,
        clicks: 200,
        spend: 550,
        conversions: 50,
        revenue: 1000,
      });

      const result = await withAdvancedTimers(() =>
        service.getPacingStatus({
          advertiserId: "adv-123",
          campaignId: "camp-456",
          budgetTotal: 1000,
          flightStartDate: "2024-01-01",
          flightEndDate: "2024-01-31",
        })
      );

      expect(result.status).toBe("BEHIND");
    });

    it("calculates SEVERELY_BEHIND status", async () => {
      // Flight: Jan 1 - Jan 31 (31 days)
      // Today: Jan 25 => effectiveEndDate = 2024-01-25
      // daysPassed = daysBetween(Jan 1, Jan 25) + 1 = 24 + 1 = 25
      // totalDays = 31
      // expected = 25/31 * 100 = 80.65%
      // spend = 200, budget = 1000 => actual = 20%
      // ratio = 20 / 80.65 = 0.248 => SEVERELY_BEHIND (< 0.8)
      vi.setSystemTime(new Date("2024-01-25T12:00:00Z"));

      setupFullLifecycleMocks(mockClient);
      (parseCSVToDeliveryMetrics as any).mockReturnValue({
        impressions: 10000,
        clicks: 200,
        spend: 200,
        conversions: 50,
        revenue: 1000,
      });

      const result = await withAdvancedTimers(() =>
        service.getPacingStatus({
          advertiserId: "adv-123",
          campaignId: "camp-456",
          budgetTotal: 1000,
          flightStartDate: "2024-01-01",
          flightEndDate: "2024-01-31",
        })
      );

      expect(result.status).toBe("SEVERELY_BEHIND");
    });
  });

  // =========================================================================
  // getPerformanceMetrics
  // =========================================================================

  describe("getPerformanceMetrics", () => {
    it("delegates to getDeliveryMetrics and calculatePerformanceMetrics", async () => {
      setupFullLifecycleMocks(mockClient);

      const result = await withAdvancedTimers(() =>
        service.getPerformanceMetrics({
          advertiserId: "adv-123",
          campaignId: "camp-456",
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        })
      );

      expect(result).toEqual({
        impressions: 10000,
        clicks: 200,
        spend: 500,
        conversions: 50,
        revenue: 1000,
        cpm: 50,
        ctr: 2,
        cpc: 2.5,
        cpa: 10,
        roas: 2,
      });

      expect(calculatePerformanceMetrics).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // executeCustomQuery
  // =========================================================================

  describe("executeCustomQuery", () => {
    beforeEach(() => {
      mockClient.queries.create.mockResolvedValue({
        data: { queryId: "q-custom" },
      });
      mockClient.queries.run.mockResolvedValue({
        data: { key: { reportId: "r-custom" } },
      });
      mockClient.queries.reports.get.mockResolvedValue({
        data: {
          metadata: {
            status: { state: "DONE", format: "CSV" },
            googleCloudStoragePath: "https://storage.com/custom.csv",
          },
        },
      });
    });

    it("handles preset date range", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => "impressions,clicks\n1000,50",
        })
      );

      const result = await withAdvancedTimers(() =>
        service.executeCustomQuery({
          reportType: "STANDARD",
          groupBys: ["FILTER_DATE"],
          metrics: ["METRIC_IMPRESSIONS", "METRIC_CLICKS"],
          dateRange: { preset: "LAST_7_DAYS" },
        })
      );

      expect(result.status).toBe("DONE");

      // Verify the query used a preset range
      const createCall = mockClient.queries.create.mock.calls[0][0];
      expect(createCall.requestBody.metadata.dataRange.range).toBe("LAST_7_DAYS");
      expect(createCall.requestBody.metadata.dataRange.customStartDate).toBeUndefined();
    });

    it("handles custom date range", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => "impressions,clicks\n1000,50",
        })
      );

      const result = await withAdvancedTimers(() =>
        service.executeCustomQuery({
          reportType: "STANDARD",
          groupBys: ["FILTER_DATE"],
          metrics: ["METRIC_IMPRESSIONS"],
          dateRange: { startDate: "2024-03-01", endDate: "2024-03-31" },
        })
      );

      expect(result.status).toBe("DONE");

      const createCall = mockClient.queries.create.mock.calls[0][0];
      expect(createCall.requestBody.metadata.dataRange.range).toBe("CUSTOM_DATES");
      expect(createCall.requestBody.metadata.dataRange.customStartDate).toEqual({
        year: 2024,
        month: 3,
        day: 1,
      });
    });

    it("throws on invalid date range config", async () => {
      await expect(
        service.executeCustomQuery({
          reportType: "STANDARD",
          groupBys: ["FILTER_DATE"],
          metrics: ["METRIC_IMPRESSIONS"],
          dateRange: {},
        })
      ).rejects.toThrow(BidManagerError);
    });

    it("returns CSV format correctly", async () => {
      const csvContent = "impressions,clicks\n1000,50\n2000,100";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => csvContent,
        })
      );

      const result = await withAdvancedTimers(() =>
        service.executeCustomQuery({
          reportType: "STANDARD",
          groupBys: ["FILTER_DATE"],
          metrics: ["METRIC_IMPRESSIONS"],
          dateRange: { preset: "LAST_7_DAYS" },
          outputFormat: "csv",
        })
      );

      expect(result.status).toBe("DONE");
      expect(result.data).toBe(csvContent);
      expect(result.columns).toEqual(["impressions", "clicks"]);
      expect(result.rowCount).toBe(2);
    });

    it("returns structured format correctly", async () => {
      const csvContent = "impressions,clicks\n1000,50\n2000,100";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => csvContent,
        })
      );

      const result = await withAdvancedTimers(() =>
        service.executeCustomQuery({
          reportType: "STANDARD",
          groupBys: ["FILTER_DATE"],
          metrics: ["METRIC_IMPRESSIONS"],
          dateRange: { preset: "LAST_7_DAYS" },
          outputFormat: "structured",
        })
      );

      expect(result.status).toBe("DONE");
      expect(Array.isArray(result.data)).toBe(true);
      const data = result.data as Record<string, unknown>[];
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({ impressions: "1000", clicks: "50" });
      expect(data[1]).toEqual({ impressions: "2000", clicks: "100" });
      expect(result.columns).toEqual(["impressions", "clicks"]);
      expect(result.rowCount).toBe(2);
    });
  });
});
