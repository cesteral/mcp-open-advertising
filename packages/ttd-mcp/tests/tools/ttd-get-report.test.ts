import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  getReportLogic,
  getReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-report.tool.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getReportLogic", () => {
  let mockTtdReportingService: { runReport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdReportingService = {
      runReport: vi.fn().mockResolvedValue({
        reportScheduleId: "rpt-001",
        execution: { ReportExecutionState: "Complete", ReportStartDateUtc: "2025-01-01" },
        downloadUrl: "https://ttd.example.com/reports/rpt-001.csv",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdReportingService: mockTtdReportingService,
    });
  });

  it("returns report result with correct structure", async () => {
    const result = await getReportLogic(
      { reportName: "My Report", dateRange: "Last7Days" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.reportScheduleId).toBe("rpt-001");
    expect(result.execution).toEqual({
      ReportExecutionState: "Complete",
      ReportStartDateUtc: "2025-01-01",
    });
    expect(result.downloadUrl).toBe("https://ttd.example.com/reports/rpt-001.csv");
    expect(result.timestamp).toBeDefined();
    expect(() => new Date(result.timestamp)).not.toThrow();
  });

  it("builds report config with correct fields", async () => {
    await getReportLogic(
      { reportName: "Daily Report", dateRange: "Yesterday" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdReportingService.runReport).toHaveBeenCalledOnce();
    const [reportConfig] = mockTtdReportingService.runReport.mock.calls[0];
    expect(reportConfig.ReportScheduleName).toBe("Daily Report");
    expect(reportConfig.ReportScheduleType).toBe("Once");
    expect(reportConfig.ReportDateRange).toBe("Yesterday");
  });

  it("includes optional dimensions and metrics", async () => {
    await getReportLogic(
      {
        reportName: "Detailed Report",
        dateRange: "Last30Days",
        dimensions: ["AdvertiserId", "CampaignId"],
        metrics: ["Impressions", "Clicks", "TotalCost"],
      },
      createMockContext(),
      createMockSdkContext()
    );

    const [reportConfig] = mockTtdReportingService.runReport.mock.calls[0];
    expect(reportConfig.ReportDimensions).toEqual(["AdvertiserId", "CampaignId"]);
    expect(reportConfig.ReportMetrics).toEqual(["Impressions", "Clicks", "TotalCost"]);
  });

  it("includes advertiser filters when provided", async () => {
    await getReportLogic(
      {
        reportName: "Filtered Report",
        dateRange: "Last7Days",
        advertiserIds: ["adv-001", "adv-002"],
      },
      createMockContext(),
      createMockSdkContext()
    );

    const [reportConfig] = mockTtdReportingService.runReport.mock.calls[0];
    expect(reportConfig.AdvertiserFilters).toEqual(["adv-001", "adv-002"]);
  });

  it("spreads additionalConfig into report config", async () => {
    await getReportLogic(
      {
        reportName: "Custom Report",
        dateRange: "Custom",
        additionalConfig: {
          ReportStartDateUtc: "2025-01-01",
          ReportEndDateUtc: "2025-01-31",
          TimeZone: "UTC",
        },
      },
      createMockContext(),
      createMockSdkContext()
    );

    const [reportConfig] = mockTtdReportingService.runReport.mock.calls[0];
    expect(reportConfig.ReportStartDateUtc).toBe("2025-01-01");
    expect(reportConfig.ReportEndDateUtc).toBe("2025-01-31");
    expect(reportConfig.TimeZone).toBe("UTC");
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      getReportLogic({ reportName: "Test", dateRange: "Last7Days" }, createMockContext(), undefined)
    ).rejects.toThrow("No session ID available.");
  });

  it("handles report result without downloadUrl", async () => {
    mockTtdReportingService.runReport.mockResolvedValue({
      reportScheduleId: "rpt-002",
      execution: { ReportExecutionState: "Complete" },
      // No downloadUrl
    });

    const result = await getReportLogic(
      { reportName: "No URL Report", dateRange: "Last7Days" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.reportScheduleId).toBe("rpt-002");
    expect(result.downloadUrl).toBeUndefined();
  });
});

describe("getReportResponseFormatter", () => {
  it("shows download URL when available", () => {
    const result = {
      reportScheduleId: "rpt-001",
      execution: { ReportExecutionState: "Complete" },
      downloadUrl: "https://ttd.example.com/reports/rpt-001.csv",
      timestamp: new Date().toISOString(),
    };

    const content = getReportResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Report generated: rpt-001");
    expect(content[0].text).toContain("Download URL: https://ttd.example.com/reports/rpt-001.csv");
  });

  it("indicates no URL when unavailable", () => {
    const result = {
      reportScheduleId: "rpt-002",
      execution: { ReportExecutionState: "Complete" },
      timestamp: new Date().toISOString(),
    };

    const content = getReportResponseFormatter(result);

    expect(content[0].text).toContain("No download URL available yet.");
    expect(content[0].text).not.toContain("Download URL: http");
  });

  it("includes execution details as JSON", () => {
    const execution = { ReportExecutionState: "Complete", TotalRows: 1500 };
    const result = {
      reportScheduleId: "rpt-003",
      execution,
      timestamp: new Date().toISOString(),
    };

    const content = getReportResponseFormatter(result);

    expect(content[0].text).toContain("Execution details:");
    expect(content[0].text).toContain('"ReportExecutionState": "Complete"');
    expect(content[0].text).toContain('"TotalRows": 1500');
  });
});
