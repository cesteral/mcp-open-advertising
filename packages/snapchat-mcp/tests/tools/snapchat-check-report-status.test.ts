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
    snapchatReportingService: {
      checkReportStatus: mockCheckReportStatus,
    },
  } as any);
});

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

describe("checkReportStatusLogic", () => {
  it("returns canonical 'complete' state with downloadUrl", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "task-1",
      status: "COMPLETE",
      downloadUrl: "https://example.com/report.csv",
    });

    const result = await checkReportStatusLogic(
      { adAccountId: "1234567890", taskId: "task-1" },
      baseContext,
      baseSdkContext
    );

    expect(result.taskId).toBe("task-1");
    expect(result.state).toBe("complete");
    expect(result.rawStatus).toBe("COMPLETE");
    expect(result.isComplete).toBe(true);
    expect(result.downloadUrl).toBe("https://example.com/report.csv");
  });

  it("returns canonical 'running' state with isComplete false", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "task-2",
      status: "RUNNING",
    });

    const result = await checkReportStatusLogic(
      { adAccountId: "1234567890", taskId: "task-2" },
      baseContext,
      baseSdkContext
    );

    expect(result.state).toBe("running");
    expect(result.rawStatus).toBe("RUNNING");
    expect(result.isComplete).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
  });

  it("calls checkReportStatus with correct taskId", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "task-xyz",
      status: "PENDING",
    });

    await checkReportStatusLogic(
      { adAccountId: "1234567890", taskId: "task-xyz" },
      baseContext,
      baseSdkContext
    );

    expect(mockCheckReportStatus).toHaveBeenCalledWith("task-xyz", baseContext);
  });
});

describe("checkReportStatusResponseFormatter", () => {
  it("shows download guidance when complete with URL", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "task-1",
      state: "complete",
      rawStatus: "COMPLETE",
      isComplete: true,
      downloadUrl: "https://example.com/report.csv",
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report complete");
    expect(content[0].text).toContain("snapchat_download_report");
  });

  it("shows retry guidance when in progress", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "task-2",
      state: "running",
      rawStatus: "RUNNING",
      isComplete: false,
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report in progress");
    expect(content[0].text).toContain("snapchat_check_report_status");
    expect(content[0].text).toContain("10 seconds");
  });

  it("shows failure message when failed", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "task-3",
      state: "failed",
      rawStatus: "FAILED",
      isComplete: false,
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report failed");
  });
});
