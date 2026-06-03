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

describe("meta_submit_report governance contract (effect class)", () => {
  let svc: { submitInsightsReport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      submitInsightsReport: vi.fn().mockResolvedValue({ reportRunId: "run-1" }),
    };
    mockResolveSessionServices.mockReturnValue({ metaInsightsService: svc });
  });

  it("dry_run returns a symbolic effect preview, no API call", async () => {
    const result = await submitReportLogic(
      { entityId: "act_1", datePreset: "last_30d", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.submitInsightsReport).not.toHaveBeenCalled();
    expect(result.reportRunId).toBeUndefined();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "report_requested",
      summary: { report_type: "insights" },
    });
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dispatchedCapability).toEqual({
      operation: "submit_report",
      canonicalEntityKind: null,
    });
    expect(() => SubmitReportOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an inverted custom time range", async () => {
    const result = await submitReportLogic(
      {
        entityId: "act_1",
        timeRange: { since: "2026-03-10", until: "2026-03-01" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_DATE_RANGE");
  });

  it("execute returns the effect identity + null-kind capability", async () => {
    const result = await submitReportLogic(
      { entityId: "act_1", datePreset: "last_30d" } as any,
      ctx,
      sdk
    );
    expect(svc.submitInsightsReport).toHaveBeenCalledOnce();
    expect(result.reportRunId).toBe("run-1");
    expect(result.effect).toEqual({
      effectKind: "report_requested",
      summary: { report_type: "insights", report_handle: "run-1" },
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
          summary: { report_type: "insights" },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: submitting a insights report would succeed");
    expect(content[0].text).not.toContain("Report submitted:");
  });
});
