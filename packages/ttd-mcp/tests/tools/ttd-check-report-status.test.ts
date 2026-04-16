import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  checkReportStatusLogic,
  checkReportStatusResponseFormatter,
} from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";

function createMockContext() {
  return { requestId: "req-123", timestamp: new Date().toISOString(), operation: "test" } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

describe("checkReportStatusLogic", () => {
  let mockTtdReportingService: { checkReportExecution: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdReportingService = {
      checkReportExecution: vi.fn().mockResolvedValue({
        reportScheduleId: "sched-1",
        state: "Complete",
        execution: { ReportExecutionState: "Complete" },
        downloadUrl: "https://files.ttd.com/report.csv",
      }),
    };
    mockResolveSessionServices.mockReturnValue({ ttdReportingService: mockTtdReportingService });
  });

  it("returns complete status with downloadUrl", async () => {
    const result = await checkReportStatusLogic(
      { reportScheduleId: "sched-1" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.state).toBe("complete");
    expect(result.isComplete).toBe(true);
    expect(result.downloadUrl).toBe("https://files.ttd.com/report.csv");
    expect(result.timestamp).toBeDefined();
  });

  it("returns pending status with isComplete false", async () => {
    mockTtdReportingService.checkReportExecution.mockResolvedValue({
      reportScheduleId: "sched-2",
      state: "Pending",
      execution: { ReportExecutionState: "Pending" },
    });

    const result = await checkReportStatusLogic(
      { reportScheduleId: "sched-2" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.state).toBe("pending");
    expect(result.isComplete).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
  });

  it("calls checkReportExecution with correct ID", async () => {
    await checkReportStatusLogic(
      { reportScheduleId: "sched-xyz" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdReportingService.checkReportExecution).toHaveBeenCalledWith(
      "sched-xyz",
      expect.any(Object)
    );
  });
});

describe("checkReportStatusResponseFormatter", () => {
  it("shows download guidance when complete with URL", () => {
    const result = {
      reportScheduleId: "sched-1",
      state: "complete" as const,
      isComplete: true,
      downloadUrl: "https://files.ttd.com/report.csv",
      execution: { ReportExecutionState: "Complete" },
      timestamp: new Date().toISOString(),
    };

    const content = checkReportStatusResponseFormatter(result);
    expect(content[0].text).toContain("Report complete");
    expect(content[0].text).toContain("ttd_download_report");
  });

  it("shows retry guidance when in progress", () => {
    const result = {
      reportScheduleId: "sched-2",
      state: "pending" as const,
      isComplete: false,
      execution: { ReportExecutionState: "Pending" },
      timestamp: new Date().toISOString(),
    };

    const content = checkReportStatusResponseFormatter(result);
    expect(content[0].text).toContain("Report in progress");
    expect(content[0].text).toContain("ttd_check_report_status");
    expect(content[0].text).toContain("5-10 seconds");
  });

  it("shows failure message when failed", () => {
    const result = {
      reportScheduleId: "sched-3",
      state: "failed" as const,
      isComplete: false,
      execution: { ReportExecutionState: "Failed" },
      timestamp: new Date().toISOString(),
    };

    const content = checkReportStatusResponseFormatter(result);
    expect(content[0].text).toContain("Report failed");
  });
});
