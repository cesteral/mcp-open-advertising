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
  deleteReportScheduleLogic,
  deleteReportScheduleResponseFormatter,
  DeleteReportScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-report-schedule.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

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

describe("msads report-schedule governance contract (effect class)", () => {
  let svc: {
    createReportSchedule: ReturnType<typeof vi.fn>;
    deleteReportSchedule: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      createReportSchedule: vi
        .fn()
        .mockResolvedValue({ scheduleId: "sch-1", scheduleName: "Weekly Report" }),
      deleteReportSchedule: vi.fn().mockResolvedValue(undefined),
    };
    mockResolveSessionServices.mockReturnValue({ msadsReportingService: svc });
    mockElicitDelete.mockResolvedValue(true);
  });

  describe("msads_create_report_schedule", () => {
    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await createReportScheduleLogic(
        { ...createInput, dry_run: true } as any,
        ctx,
        sdk
      );
      expect(svc.createReportSchedule).not.toHaveBeenCalled();
      expect(result.scheduleId).toBeUndefined();
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

    it("dry_run flags malformed dates", async () => {
      const result = await createReportScheduleLogic(
        { ...createInput, startDate: "foo", endDate: "zzz", dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e: any) => e.code)).toContain(
        "INVALID_DATE_FORMAT"
      );
    });

    it("execute returns the effect identity + null-kind capability", async () => {
      const result = await createReportScheduleLogic({ ...createInput } as any, ctx, sdk);
      expect(svc.createReportSchedule).toHaveBeenCalledOnce();
      expect(result.scheduleId).toBe("sch-1");
      expect(result.effect).toEqual({
        effectKind: "report_schedule_saved",
        summary: { entity_label: "report_schedule", schedule_handle: "sch-1" },
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
      expect(content[0].text).not.toContain("Scheduled report created:");
    });
  });

  describe("msads_delete_report_schedule", () => {
    const deleteInput = { scheduleId: "sch-1" };

    it("dry_run returns a symbolic effect preview, no confirmation or API call", async () => {
      const result = await deleteReportScheduleLogic(
        { ...deleteInput, dry_run: true } as any,
        ctx,
        sdk
      );
      expect(mockElicitDelete).not.toHaveBeenCalled();
      expect(svc.deleteReportSchedule).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_schedule_deleted",
        summary: { entity_label: "report_schedule", schedule_handle: "sch-1" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "delete_schedule",
        canonicalEntityKind: null,
      });
      expect(() => DeleteReportScheduleOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("execute deletes and returns the effect identity", async () => {
      const result = await deleteReportScheduleLogic({ ...deleteInput } as any, ctx, sdk);
      expect(svc.deleteReportSchedule).toHaveBeenCalledOnce();
      expect(result.effect).toEqual({
        effectKind: "report_schedule_deleted",
        summary: { entity_label: "report_schedule", schedule_handle: "sch-1" },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => DeleteReportScheduleOutputSchema.parse(result)).not.toThrow();
    });

    it("declined confirmation reports the capability, no effect", async () => {
      mockElicitDelete.mockResolvedValue(false);
      const result = await deleteReportScheduleLogic({ ...deleteInput } as any, ctx, sdk);
      expect(svc.deleteReportSchedule).not.toHaveBeenCalled();
      expect(result.confirmed).toBe(false);
      expect(result.effect).toBeUndefined();
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    });

    it("formatter renders a dry-run message without a false success", () => {
      const content = deleteReportScheduleResponseFormatter({
        confirmed: true,
        scheduleId: "sch-1",
        timestamp: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "delete_schedule", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "report_schedule_deleted",
            summary: { entity_label: "report_schedule", schedule_handle: "sch-1" },
          },
        },
      } as any);
      expect(content[0].text).toContain("Dry run: deleting report schedule sch-1 would succeed");
      expect(content[0].text).not.toContain("deletion requested");
    });
  });
});
