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
  reportType: "KeywordPerformanceReportRequest",
  accountId: "123456789",
  columns: ["Keyword", "Impressions"],
  datePreset: "LAST_30_DAYS",
};

describe("msads_submit_report governance contract (effect class)", () => {
  let svc: { submitReport: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      submitReport: vi.fn().mockResolvedValue("req-1"),
    };
    mockResolveSessionServices.mockReturnValue({ msadsReportingService: svc });
  });

  it("dry_run returns a symbolic effect preview, no API call", async () => {
    const result = await submitReportLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(svc.submitReport).not.toHaveBeenCalled();
    expect(result.reportRequestId).toBeUndefined();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "report_requested",
      summary: { report_type: "KeywordPerformanceReportRequest" },
    });
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dispatchedCapability).toEqual({
      operation: "submit_report",
      canonicalEntityKind: null,
    });
    expect(() => SubmitReportOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an inverted date range", async () => {
    const result = await submitReportLogic(
      {
        ...baseInput,
        datePreset: undefined,
        startDate: "2026-03-10",
        endDate: "2026-03-01",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_DATE_RANGE");
  });

  it("dry_run flags malformed-but-ordered dates the execute path would reject", async () => {
    const result = await submitReportLogic(
      {
        ...baseInput,
        datePreset: undefined,
        startDate: "foo",
        endDate: "zzz",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors.map((e: any) => e.code)).toEqual([
      "INVALID_DATE_FORMAT",
      "INVALID_DATE_FORMAT",
    ]);
  });

  it("execute returns the effect identity + null-kind capability", async () => {
    const result = await submitReportLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.submitReport).toHaveBeenCalledOnce();
    expect(result.reportRequestId).toBe("req-1");
    expect(result.effect).toEqual({
      effectKind: "report_requested",
      summary: { report_type: "KeywordPerformanceReportRequest", report_handle: "req-1" },
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
          summary: { report_type: "KeywordPerformanceReportRequest" },
        },
      },
    } as any);
    expect(content[0].text).toContain("would succeed");
    expect(content[0].text).not.toContain("ReportRequestId:");
  });
});
