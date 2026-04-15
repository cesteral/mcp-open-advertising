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
  it("returns complete status with downloadUrl when COMPLETED", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "rpt-1",
      status: "COMPLETED",
      downloadUrl: "https://example.com/report.json",
    });

    const result = await checkReportStatusLogic(
      { accountId: "1234567890", taskId: "rpt-1" },
      baseContext,
      baseSdkContext
    );

    expect(result.taskId).toBe("rpt-1");
    expect(result.status).toBe("COMPLETED");
    expect(result.isComplete).toBe(true);
    expect(result.downloadUrl).toBe("https://example.com/report.json");
  });

  it("returns pending status with isComplete false", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "rpt-2",
      status: "PROCESSING",
    });

    const result = await checkReportStatusLogic(
      { accountId: "1234567890", taskId: "rpt-2" },
      baseContext,
      baseSdkContext
    );

    expect(result.status).toBe("PROCESSING");
    expect(result.isComplete).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
  });

  it("calls checkReportStatus with correct taskId", async () => {
    mockCheckReportStatus.mockResolvedValueOnce({
      taskId: "rpt-xyz",
      status: "PENDING",
    });

    await checkReportStatusLogic(
      { accountId: "1234567890", taskId: "rpt-xyz" },
      baseContext,
      baseSdkContext
    );

    expect(mockCheckReportStatus).toHaveBeenCalledWith("1234567890", "rpt-xyz", baseContext);
  });
});

describe("checkReportStatusResponseFormatter", () => {
  it("shows download guidance when COMPLETED with URL", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "rpt-1",
      status: "COMPLETED",
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
      status: "PROCESSING",
      isComplete: false,
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report in progress");
    expect(content[0].text).toContain("amazon_dsp_check_report_status");
    expect(content[0].text).toContain("10 seconds");
  });

  it("shows failure message when FAILED", () => {
    const content = checkReportStatusResponseFormatter({
      taskId: "rpt-3",
      status: "FAILED",
      isComplete: false,
      timestamp: new Date().toISOString(),
    });

    expect(content[0].text).toContain("Report failed");
  });
});
