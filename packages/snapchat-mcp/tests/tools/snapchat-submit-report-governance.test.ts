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
  SubmitReportOutputSchema,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  adAccountId: "1234567890",
  fields: ["impressions"],
  datePreset: "LAST_7_DAYS",
  dimensionType: "CAMPAIGN",
};

describe("snapchat_submit_report governance contract (effect class)", () => {
  let svc: { submitReport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      submitReport: vi.fn().mockResolvedValue({ task_id: "task-1" }),
    };
    mockResolveSessionServices.mockReturnValue({ snapchatReportingService: svc });
  });

  it("dry_run returns a symbolic effect preview, no API call", async () => {
    const result = await submitReportLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(svc.submitReport).not.toHaveBeenCalled();
    expect(result.taskId).toBeUndefined();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "report_requested",
      summary: { report_type: "CAMPAIGN" },
    });
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dispatchedCapability).toEqual({
      operation: "submit_report",
      canonicalEntityKind: null,
    });
    expect(() => SubmitReportOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run defaults report_type to account-level and flags an inverted range", async () => {
    const result = await submitReportLogic(
      {
        adAccountId: "1",
        fields: ["impressions"],
        startTime: "2026-03-10T00:00:00Z",
        endTime: "2026-03-01T00:00:00Z",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.expectedEffect?.summary).toEqual({ report_type: "account" });
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_DATE_RANGE");
  });

  it("execute returns the effect identity + null-kind capability", async () => {
    const result = await submitReportLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.submitReport).toHaveBeenCalledOnce();
    expect(result.taskId).toBe("task-1");
    expect(result.effect).toEqual({
      effectKind: "report_requested",
      summary: { report_type: "CAMPAIGN", report_handle: "task-1" },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => SubmitReportOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = submitReportResponseFormatter({
      timestamp: "2026-06-03T00:00:00.000Z",
      dispatchedCapability: { operation: "submit_report", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "report_requested",
          summary: { report_type: "CAMPAIGN" },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: submitting a CAMPAIGN report would succeed");
    expect(content[0].text).not.toContain("Report submitted:");
  });
});
