import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Microsoft Advertising Reporting v13 has no report schedules (the reporting
 * service documents only GenerateReport/Submit and /Poll; ReportRequest has no
 * Schedule element). The create/delete schedule tools therefore refuse every
 * call: they must never reach the API, prompt for confirmation, or emit an
 * effect that governance would record as a schedule saved/deleted.
 */

const { mockResolveSessionServices, mockElicitDelete } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitDelete: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitDeleteConfirmation: mockElicitDelete };
});

import {
  createReportScheduleLogic,
  createReportScheduleResponseFormatter,
  createReportScheduleTool,
  CreateReportScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/create-report-schedule.tool.js";
import {
  deleteReportScheduleLogic,
  deleteReportScheduleResponseFormatter,
  deleteReportScheduleTool,
  DeleteReportScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-report-schedule.tool.js";
import { McpError, JsonRpcErrorCode, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const createInput = {
  accountId: "123456789",
  scheduleName: "Weekly Report",
  reportType: "CampaignPerformanceReportRequest",
  columns: ["Impressions"],
  startDate: "2026-04-07",
  endDate: "2026-04-13",
  schedule: { StartDate: "2026-04-07", Frequency: "Weekly" },
};

describe("msads report-schedule tools (Microsoft Advertising has no report schedules)", () => {
  let reportingSvc: Record<string, ReturnType<typeof vi.fn>>;
  let campaignSvc: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    reportingSvc = { submitReport: vi.fn(), pollReport: vi.fn() };
    campaignSvc = { executeOperation: vi.fn() };
    mockResolveSessionServices.mockReturnValue({
      msadsReportingService: reportingSvc,
      msadsService: campaignSvc,
    });
    mockElicitDelete.mockResolvedValue(true);
  });

  describe("msads_create_report_schedule", () => {
    it("execute refuses with a clear error and calls nothing", async () => {
      const call = createReportScheduleLogic({ ...createInput } as any, ctx, sdk);
      await expect(call).rejects.toBeInstanceOf(McpError);
      await expect(call).rejects.toMatchObject({ code: JsonRpcErrorCode.InvalidRequest });
      await expect(call).rejects.toThrow(/has no report schedules/);
      expect(reportingSvc.submitReport).not.toHaveBeenCalled();
      expect(mockResolveSessionServices).not.toHaveBeenCalled();
    });

    it("dry_run always reports wouldSucceed: false with no expected effect", async () => {
      const result = await createReportScheduleLogic(
        { ...createInput, dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.scheduleId).toBeUndefined();
      expect(result.effect).toBeUndefined();
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("UNSUPPORTED_OPERATION");
      expect(result.dryRun?.expectedEffect).toBeUndefined();
      expect(result.dryRun?.expectedEffectSource).toBe("none");
      expect(result.dispatchedCapability).toEqual({
        operation: "create_schedule",
        canonicalEntityKind: null,
      });
      expect(() => CreateReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("dry_run still reports malformed dates alongside the unsupported error", async () => {
      const result = await createReportScheduleLogic(
        { ...createInput, startDate: "foo", endDate: "zzz", dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.validationErrors.map((e: any) => e.code)).toEqual(
        expect.arrayContaining(["UNSUPPORTED_OPERATION", "INVALID_DATE_FORMAT"])
      );
    });

    it("description and contract no longer claim a schedule is created", () => {
      expect(createReportScheduleTool.description).toMatch(/^NOT SUPPORTED/);
      expect(createReportScheduleTool.description).not.toMatch(/will re-run/);
      const c = (createReportScheduleTool.annotations as { cesteral: any }).cesteral;
      expect(c.requiresSimulation).toBe(false);
    });

    it("formatter renders the dry-run failure without claiming a schedule", () => {
      const content = createReportScheduleResponseFormatter({
        timestamp: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "create_schedule", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: false,
          validationErrors: [{ code: "UNSUPPORTED_OPERATION", message: "no schedules" }],
          validationSource: "symbolic",
          expectedEffectSource: "none",
        },
      } as any);
      expect(content[0].text).toContain("Dry run: creating a report schedule would FAIL");
      expect(content[0].text).not.toContain("Scheduled report created:");
    });
  });

  describe("msads_delete_report_schedule", () => {
    const deleteInput = { scheduleId: "sch-1" };

    it("execute refuses without prompting, calling the API, or emitting an effect", async () => {
      const call = deleteReportScheduleLogic({ ...deleteInput } as any, ctx, sdk);
      await expect(call).rejects.toBeInstanceOf(McpError);
      await expect(call).rejects.toThrow(/has no report schedules.*Nothing was deleted/);
      expect(mockElicitDelete).not.toHaveBeenCalled();
      expect(mockResolveSessionServices).not.toHaveBeenCalled();
    });

    it("dry_run always reports wouldSucceed: false with no simulated effect", async () => {
      const result = await deleteReportScheduleLogic(
        { ...deleteInput, dry_run: true } as any,
        ctx,
        sdk
      );
      expect(mockElicitDelete).not.toHaveBeenCalled();
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("UNSUPPORTED_OPERATION");
      expect(result.dryRun?.expectedEffect).toBeUndefined();
      expect(result.dryRun?.expectedEffectSource).toBe("none");
      expect(result.dispatchedCapability).toEqual({
        operation: "delete_schedule",
        canonicalEntityKind: null,
      });
      expect(() => DeleteReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("description no longer reads as a delete", () => {
      expect(deleteReportScheduleTool.description).toMatch(/^NOT SUPPORTED/);
      expect(deleteReportScheduleTool.description).toContain("Nothing is deleted");
    });

    it("formatter renders the dry-run failure", () => {
      const content = deleteReportScheduleResponseFormatter({
        confirmed: true,
        scheduleId: "sch-1",
        timestamp: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "delete_schedule", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: false,
          validationErrors: [{ code: "UNSUPPORTED_OPERATION", message: "no schedules" }],
          validationSource: "symbolic",
          expectedEffectSource: "none",
        },
      } as any);
      expect(content[0].text).toContain(
        "Dry run: delete request for report schedule sch-1 would FAIL"
      );
      expect(content[0].text).toContain("nothing would be deleted");
    });
  });
});
