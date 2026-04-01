import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  submitReportLogic,
  submitReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

function createMockContext() {
  return { requestId: "req-123", timestamp: new Date().toISOString(), operation: "test" } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

describe("submitReportLogic", () => {
  let mockTtdReportingService: { createReportSchedule: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdReportingService = {
      createReportSchedule: vi.fn().mockResolvedValue({ reportScheduleId: "sched-new-1" }),
    };
    mockResolveSessionServices.mockReturnValue({ ttdReportingService: mockTtdReportingService });
  });

  it("returns reportScheduleId and timestamp", async () => {
    const result = await submitReportLogic(
      { reportName: "My Report", dateRange: "Last7Days" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.reportScheduleId).toBe("sched-new-1");
    expect(result.timestamp).toBeDefined();
  });

  it("builds report config correctly", async () => {
    await submitReportLogic(
      {
        reportName: "Test Report",
        dateRange: "Last30Days",
        dimensions: ["CampaignId"],
        metrics: ["Impressions"],
        advertiserIds: ["adv-1"],
      },
      createMockContext(),
      createMockSdkContext()
    );

    const [config] = mockTtdReportingService.createReportSchedule.mock.calls[0];
    expect(config.ReportScheduleName).toBe("Test Report");
    expect(config.ReportScheduleType).toBe("Once");
    expect(config.ReportDateRange).toBe("Last30Days");
    expect(config.ReportDimensions).toEqual(["CampaignId"]);
    expect(config.ReportMetrics).toEqual(["Impressions"]);
    expect(config.AdvertiserFilters).toEqual(["adv-1"]);
  });

  it("calls createReportSchedule, not runReport", async () => {
    await submitReportLogic(
      { reportName: "Test", dateRange: "Yesterday" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdReportingService.createReportSchedule).toHaveBeenCalledOnce();
  });
});

describe("submitReportResponseFormatter", () => {
  it("includes guidance to use ttd_check_report_status", () => {
    const result = {
      reportScheduleId: "sched-abc",
      timestamp: new Date().toISOString(),
    };

    const content = submitReportResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Report submitted: sched-abc");
    expect(content[0].text).toContain("ttd_check_report_status");
  });
});
