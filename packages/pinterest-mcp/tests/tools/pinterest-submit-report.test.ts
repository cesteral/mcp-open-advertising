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
    pinterestReportingService: {
      submitReport: mockSubmitReport,
    },
  } as any);
});

const baseContext = { requestId: "test-req" } as any;
const baseSdkContext = { sessionId: "test-session" } as any;

describe("submitReportLogic", () => {
  it("returns taskId and timestamp", async () => {
    mockSubmitReport.mockResolvedValueOnce({ task_id: "task-new-1" });

    const result = await submitReportLogic(
      {
        adAccountId: "1234567890",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
      },
      baseContext,
      baseSdkContext
    );

    expect(result.taskId).toBe("task-new-1");
    expect(result.timestamp).toBeDefined();
  });

  it("passes report config to submitReport", async () => {
    mockSubmitReport.mockResolvedValueOnce({ task_id: "task-cfg" });

    await submitReportLogic(
      {
        adAccountId: "1234567890",
        type: "CAMPAIGN",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        granularity: "DAY",
        campaignIds: ["cmp-123"],
      },
      baseContext,
      baseSdkContext
    );

    expect(mockSubmitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CAMPAIGN",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR"],
        start_date: "2026-03-01",
        end_date: "2026-03-04",
        granularity: "DAY",
        campaign_ids: ["cmp-123"],
      }),
      baseContext
    );
  });

  it("calls submitReport, not getReport", async () => {
    mockSubmitReport.mockResolvedValueOnce({ task_id: "task-sub" });

    await submitReportLogic(
      {
        adAccountId: "1234567890",
        columns: ["IMPRESSION_1"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
      },
      baseContext,
      baseSdkContext
    );

    expect(mockSubmitReport).toHaveBeenCalledOnce();
  });
});

describe("submitReportResponseFormatter", () => {
  it("includes guidance to use pinterest_check_report_status", () => {
    const content = submitReportResponseFormatter({
      taskId: "task-abc",
      timestamp: new Date().toISOString(),
    });

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Report submitted: task-abc");
    expect(content[0].text).toContain("pinterest_check_report_status");
  });
});
