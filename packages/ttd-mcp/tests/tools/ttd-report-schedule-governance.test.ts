import { describe, it, expect, vi, beforeEach } from "vitest";

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
  CreateReportScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/create-report-schedule.tool.js";
import {
  updateReportScheduleLogic,
  UpdateReportScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/update-report-schedule.tool.js";
import {
  deleteReportScheduleLogic,
  deleteReportScheduleResponseFormatter,
  DeleteReportScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-report-schedule.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("ttd report-schedule governance contract (effect class)", () => {
  let ttdReportingService: {
    createReportSchedule: ReturnType<typeof vi.fn>;
    deleteReportSchedule: ReturnType<typeof vi.fn>;
  };
  let ttdService: { graphqlQuery: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    ttdReportingService = {
      createReportSchedule: vi.fn().mockResolvedValue({ reportScheduleId: "sched-1" }),
      deleteReportSchedule: vi.fn().mockResolvedValue(undefined),
    };
    ttdService = {
      graphqlQuery: vi.fn().mockResolvedValue({
        data: { myReportsReportScheduleUpdate: { data: { status: "DISABLED" }, errors: null } },
      }),
    };
    mockResolveSessionServices.mockReturnValue({ ttdReportingService, ttdService });
    mockElicitDelete.mockResolvedValue(true);
  });

  describe("ttd_create_report_schedule", () => {
    const input = {
      reportName: "Daily Perf",
      scheduleType: "Daily",
      dateRange: "Yesterday",
      reportTemplateId: 16353,
    };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await createReportScheduleLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(ttdReportingService.createReportSchedule).not.toHaveBeenCalled();
      expect(result.reportScheduleId).toBeUndefined();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_schedule_saved",
        summary: { entity_label: "report_schedule" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "create_schedule",
        canonicalEntityKind: null,
      });
      expect(() => CreateReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("dry_run flags a non-positive template id", async () => {
      const result = await createReportScheduleLogic(
        { ...input, reportTemplateId: 0, dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_TEMPLATE_ID");
    });

    it("execute returns the effect identity + null-kind capability", async () => {
      const result = await createReportScheduleLogic({ ...input } as any, ctx, sdk);
      expect(ttdReportingService.createReportSchedule).toHaveBeenCalledOnce();
      expect(result.reportScheduleId).toBe("sched-1");
      expect(result.effect).toEqual({
        effectKind: "report_schedule_saved",
        summary: { entity_label: "report_schedule", schedule_handle: "sched-1" },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => CreateReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
    });

    it("formatter renders a dry-run message without a false success", () => {
      const content = createReportScheduleResponseFormatter({
        timestamp: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "create_schedule", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "report_schedule_saved",
            summary: { entity_label: "report_schedule" },
          },
        },
      } as any);
      expect(content[0].text).toContain("Dry run: creating a report schedule would succeed");
      expect(content[0].text).not.toContain("Report schedule created:");
    });
  });

  describe("ttd_update_report_schedule", () => {
    const input = { scheduleId: "sched-1", status: "DISABLED" };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await updateReportScheduleLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(ttdService.graphqlQuery).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_schedule_saved",
        summary: { entity_label: "report_schedule", schedule_handle: "sched-1" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "update_schedule",
        canonicalEntityKind: null,
      });
      expect(() => UpdateReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("execute returns the effect identity when there are no mutation errors", async () => {
      const result = await updateReportScheduleLogic({ ...input } as any, ctx, sdk);
      expect(ttdService.graphqlQuery).toHaveBeenCalledOnce();
      expect(result.effect).toEqual({
        effectKind: "report_schedule_saved",
        summary: { entity_label: "report_schedule", schedule_handle: "sched-1" },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => UpdateReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
    });

    it("execute omits the effect when the mutation returns user errors", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          myReportsReportScheduleUpdate: {
            data: null,
            errors: [{ field: "status", message: "bad" }],
          },
        },
      });
      const result = await updateReportScheduleLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toBeUndefined();
      expect(result.errors?.[0]?.message).toBe("bad");
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    });
  });

  describe("ttd_delete_report_schedule", () => {
    const input = { scheduleId: "sched-1" };

    it("dry_run returns a symbolic effect preview, no confirmation or API call", async () => {
      const result = await deleteReportScheduleLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(mockElicitDelete).not.toHaveBeenCalled();
      expect(ttdReportingService.deleteReportSchedule).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_schedule_deleted",
        summary: { entity_label: "report_schedule", schedule_handle: "sched-1" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "delete_schedule",
        canonicalEntityKind: null,
      });
      expect(() => DeleteReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("execute deletes and returns the effect identity", async () => {
      const result = await deleteReportScheduleLogic({ ...input } as any, ctx, sdk);
      expect(ttdReportingService.deleteReportSchedule).toHaveBeenCalledOnce();
      expect(result.deleted).toBe(true);
      expect(result.effect).toEqual({
        effectKind: "report_schedule_deleted",
        summary: { entity_label: "report_schedule", schedule_handle: "sched-1" },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => DeleteReportScheduleOutputSchema.parse(result)).not.toThrow();
    });

    it("declined confirmation reports the capability, no effect", async () => {
      mockElicitDelete.mockResolvedValue(false);
      const result = await deleteReportScheduleLogic({ ...input } as any, ctx, sdk);
      expect(ttdReportingService.deleteReportSchedule).not.toHaveBeenCalled();
      expect(result.confirmed).toBe(false);
      expect(result.effect).toBeUndefined();
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    });

    it("formatter renders a dry-run message without a false success", () => {
      const content = deleteReportScheduleResponseFormatter({
        confirmed: true,
        scheduleId: "sched-1",
        deleted: false,
        timestamp: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "delete_schedule", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "report_schedule_deleted",
            summary: { entity_label: "report_schedule", schedule_handle: "sched-1" },
          },
        },
      } as any);
      expect(content[0].text).toContain("Dry run: deleting report schedule sched-1 would succeed");
      expect(content[0].text).not.toContain("Report schedule deleted:");
    });
  });
});
