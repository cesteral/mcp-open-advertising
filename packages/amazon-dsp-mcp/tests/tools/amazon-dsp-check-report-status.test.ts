import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  checkReportStatusLogic,
  checkReportStatusResponseFormatter,
} from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";

const mockCheckReportStatus = vi.fn();

beforeEach(() => {
  mockCheckReportStatus.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspReportingService: {
      checkReportStatus: mockCheckReportStatus,
    },
  } as any);
});

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

describe("checkReportStatusLogic", () => {
  it("returns canonical 'complete' state with downloadUrl when SUCCESS", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "rpt-1",
      status: "SUCCESS",
      downloadUrl: "https://example.com/report.json",
    });

    const result = await checkReportStatusLogic(
      { taskId: "rpt-1" },
      baseContext,
      baseSdkContext
    );

    expect(result.taskId).toBe("rpt-1");
    expect(result.state).toBe("complete");
    expect(result.rawStatus).toBe("SUCCESS");
    expect(result.isComplete).toBe(true);
    expect(result.downloadUrl).toBe("https://example.com/report.json");
  });

  it("returns canonical 'running' state for IN_PROGRESS", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "rpt-2",
      status: "IN_PROGRESS",
    });

    const result = await checkReportStatusLogic(
      { taskId: "rpt-2" },
      baseContext,
      baseSdkContext
    );

    expect(result.state).toBe("running");
    expect(result.rawStatus).toBe("IN_PROGRESS");
    expect(result.isComplete).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
  });

  it("calls checkReportStatus with just the taskId", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "rpt-xyz",
      status: "IN_PROGRESS",
    });

    await checkReportStatusLogic(
      { taskId: "rpt-xyz" },
      baseContext,
      baseSdkContext
    );

    expect(mockCheckReportStatus).toHaveBeenCalledWith("rpt-xyz", baseContext);
  });
});

describe("checkReportStatusResponseFormatter", () => {
  it("shows download guidance when complete with URL", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "rpt-1",
      state: "complete",
      rawStatus: "SUCCESS",
      isComplete: true,
      downloadUrl: "https://example.com/report.json",
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report complete");
    expect(content[0].text).toContain("amazon_dsp_download_report");
  });

  it("shows retry guidance when in progress", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "rpt-2",
      state: "running",
      rawStatus: "IN_PROGRESS",
      isComplete: false,
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report in progress");
    expect(content[0].text).toContain("amazon_dsp_check_report_status");
    expect(content[0].text).toContain("10 seconds");
  });

  it("shows failure message when failed", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "rpt-3",
      state: "failed",
      rawStatus: "FAILURE",
      isComplete: false,
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report failed");
  });
});
