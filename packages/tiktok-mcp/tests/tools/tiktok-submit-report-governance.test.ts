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
  submitReportTool,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  advertiserId: "1234567890",
  reportType: "BASIC",
  dimensions: ["campaign_id"],
  metrics: ["impressions"],
  datePreset: "LAST_7_DAYS",
};

describe("tiktok_submit_report governance contract (effect class, refusing — #232)", () => {
  let svc: { submitReport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = { submitReport: vi.fn().mockResolvedValue({ task_id: "task-1" }) };
    mockResolveSessionServices.mockReturnValue({
      tiktokReportingService: svc,
      boundAdvertiserId: "1234567890",
    });
  });

  // The contract (annotations, contractId) is unchanged, so governance keeps
  // recognising the tool; only its behaviour is to refuse.
  it("keeps its effect-class contract identity", () => {
    expect(submitReportTool.annotations.cesteral).toMatchObject({
      kind: "write",
      writeClass: "effect",
      operation: ["submit_report"],
      contractId: "tiktok.submit_report.v1",
    });
  });

  it("dry_run refuses rather than predicting a success nothing can use", async () => {
    await expect(
      submitReportLogic({ ...baseInput, dry_run: true } as any, ctx, sdk)
    ).rejects.toMatchObject({ code: -32600 });
    expect(svc.submitReport).not.toHaveBeenCalled();
  });

  it("execute refuses and submits nothing", async () => {
    await expect(submitReportLogic({ ...baseInput } as any, ctx, sdk)).rejects.toMatchObject({
      code: -32600,
    });
    expect(svc.submitReport).not.toHaveBeenCalled();
  });

  it("formatter still renders a dry-run shape without a false success", () => {
    const content = submitReportResponseFormatter({
      timestamp: "2026-06-03T00:00:00.000Z",
      dispatchedCapability: { operation: "submit_report", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: false,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: { effectKind: "report_requested", summary: { report_type: "BASIC" } },
      },
    } as any);
    expect(content[0].text).toContain("would FAIL");
    expect(content[0].text).not.toContain("Report submitted:");
  });
});
