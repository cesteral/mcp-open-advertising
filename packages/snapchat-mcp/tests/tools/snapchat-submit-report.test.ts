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
  submitReportLogic,
  submitReportResponseFormatter,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

const mockSubmitReport = vi.fn();

beforeEach(() => {
  mockSubmitReport.mockReset();
  mockResolveSession.mockReturnValue({
    snapchatReportingService: {
      submitReport: mockSubmitReport,
    },
  } as any);
});

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

describe("submitReportLogic", () => {
  it("returns taskId and timestamp", async () => {
    mockSubmitReport.mockResolvedValueOnce({ task_id: "ASYNC_STATS:acct:1" });

    const result = await submitReportLogic(
      {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
      },
      baseContext,
      baseSdkContext
    );

    expect(result.taskId).toBe("ASYNC_STATS:acct:1");
    expect(result.timestamp).toBeDefined();
  });

  it("passes report config to submitReport", async () => {
    mockSubmitReport.mockResolvedValueOnce({ task_id: "rpt-cfg" });

    await submitReportLogic(
      {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
        dimensionType: "CAMPAIGN",
      },
      baseContext,
      baseSdkContext
    );

    expect(mockSubmitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: ["impressions", "swipes", "spend"],
        start_time: "2026-03-01T00:00:00Z",
        end_time: "2026-03-04T23:59:59Z",
        granularity: "DAY",
        dimension_type: "CAMPAIGN",
      }),
      baseContext
    );
  });

  it("calls submitReport, not getReport", async () => {
    mockSubmitReport.mockResolvedValueOnce({ task_id: "rpt-sub" });

    await submitReportLogic(
      {
        adAccountId: "1234567890",
        fields: ["impressions"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
      },
      baseContext,
      baseSdkContext
    );

    expect(mockSubmitReport).toHaveBeenCalledOnce();
  });
});

describe("submitReportResponseFormatter", () => {
  it("includes guidance to use snapchat_check_report_status", () => {
    const content = submitReportResponseFormatter({
      taskId: "rpt-abc",
      timestamp: new Date().toISOString(),
    });

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Report submitted: rpt-abc");
    expect(content[0].text).toContain("snapchat_check_report_status");
  });
});
