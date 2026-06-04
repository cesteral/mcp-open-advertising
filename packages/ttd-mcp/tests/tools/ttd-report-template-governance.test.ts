import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  createReportTemplateLogic,
  createReportTemplateResponseFormatter,
  CreateReportTemplateOutputSchema,
} from "../../src/mcp-server/tools/definitions/create-report-template.tool.js";
import {
  updateReportTemplateLogic,
  UpdateReportTemplateOutputSchema,
} from "../../src/mcp-server/tools/definitions/update-report-template.tool.js";
import {
  createTemplateScheduleLogic,
  CreateTemplateScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/create-template-schedule.tool.js";
import {
  rerunReportScheduleLogic,
  RerunReportScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/rerun-report-schedule.tool.js";
import {
  cancelReportExecutionLogic,
  CancelReportExecutionOutputSchema,
} from "../../src/mcp-server/tools/definitions/cancel-report-execution.tool.js";
import {
  executeEntityReportLogic,
  ExecuteEntityReportOutputSchema,
} from "../../src/mcp-server/tools/definitions/execute-entity-report.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("ttd report-template + execution governance contract (effect class)", () => {
  let ttdService: {
    graphqlQuery: ReturnType<typeof vi.fn>;
    executeEntityReport: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ttdService = {
      graphqlQuery: vi.fn(),
      executeEntityReport: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({ ttdService });
  });

  describe("ttd_create_report_template", () => {
    const input = {
      name: "My Template",
      format: "EXCEL",
      resultSets: [{ name: "Tab", reportTypeId: "60", fields: [], metrics: [] }],
    };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await createReportTemplateLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(ttdService.graphqlQuery).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_template_created",
        summary: { template_name: "My Template" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "manage",
        canonicalEntityKind: null,
      });
      expect(() => CreateReportTemplateOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("dry_run flags a result set missing a report type id", async () => {
      const result = await createReportTemplateLogic(
        {
          ...input,
          resultSets: [{ name: "Tab", reportTypeId: "  ", fields: [], metrics: [] }],
          dry_run: true,
        } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_REPORT_TYPE_ID");
    });

    it("execute emits the effect when the mutation executed", async () => {
      ttdService.graphqlQuery
        .mockResolvedValueOnce({ data: { myReportsTemplateCreate: { data: "ok", errors: null } } })
        .mockResolvedValueOnce({
          data: { myReportsReportTemplates: { nodes: [{ id: "tpl-1", name: "My Template" }] } },
        });
      const result = await createReportTemplateLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toEqual({
        effectKind: "report_template_created",
        summary: { template_name: "My Template", template_id: "tpl-1" },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
      expect(() => CreateReportTemplateOutputSchema.parse(result)).not.toThrow();
    });

    it("execute omits the effect when the mutation returned errors", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsTemplateCreate: { data: null, errors: [{ message: "denied" }] } },
      });
      const result = await createReportTemplateLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toBeUndefined();
      expect(result.errors?.[0]?.message).toBe("denied");
    });

    it("formatter renders a dry-run message without a false success", () => {
      const content = createReportTemplateResponseFormatter({
        timestamp: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "manage", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "report_template_created",
            summary: { template_name: "My Template" },
          },
        },
      } as any);
      expect(content[0].text).toContain(
        'Dry run: creating report template "My Template" would succeed'
      );
      expect(content[0].text).not.toContain("created successfully");
    });
  });

  describe("ttd_update_report_template", () => {
    const input = {
      id: "tpl-1",
      name: "Updated",
      resultSets: [{ name: "Tab", reportTypeId: "60", fields: [], metrics: [] }],
    };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await updateReportTemplateLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(ttdService.graphqlQuery).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_template_updated",
        summary: { template_id: "tpl-1", template_name: "Updated" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "manage",
        canonicalEntityKind: null,
      });
      expect(() => UpdateReportTemplateOutputSchema.parse(result)).not.toThrow();
    });

    it("execute emits the effect when the mutation executed", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsTemplateUpdate: { data: "ok", errors: null } },
      });
      const result = await updateReportTemplateLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toEqual({
        effectKind: "report_template_updated",
        summary: { template_id: "tpl-1", template_name: "Updated" },
      });
      expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
    });

    it("execute omits the effect when the mutation returned errors", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsTemplateUpdate: { data: null, errors: [{ message: "bad" }] } },
      });
      const result = await updateReportTemplateLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toBeUndefined();
    });
  });

  describe("ttd_create_template_schedule", () => {
    const input = {
      templateId: "tpl-1",
      reportName: "Weekly",
      startDate: "2025-10-10T00:00:00Z",
      frequency: "WEEKLY",
      dateRange: "LAST7_DAYS",
      reportFilters: [{ reportType: "1", partnerIds: ["p-1"] }],
    };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await createTemplateScheduleLogic(
        { ...input, dry_run: true } as any,
        ctx,
        sdk
      );
      expect(ttdService.graphqlQuery).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_schedule_saved",
        summary: { template_id: "tpl-1", report_name: "Weekly" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "create_schedule",
        canonicalEntityKind: null,
      });
      expect(() => CreateTemplateScheduleOutputSchema.parse(result)).not.toThrow();
    });

    it("dry_run flags a filter missing a partner/advertiser scope", async () => {
      const result = await createTemplateScheduleLogic(
        { ...input, reportFilters: [{ reportType: "1" }], dry_run: true } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("MISSING_FILTER_SCOPE");
    });

    it("execute emits the effect when a schedule id is returned", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsTemplateScheduleCreate: { data: { scheduleId: "sch-1" }, errors: null } },
      });
      const result = await createTemplateScheduleLogic({ ...input } as any, ctx, sdk);
      expect(result.scheduleId).toBe("sch-1");
      expect(result.effect).toEqual({
        effectKind: "report_schedule_saved",
        summary: { schedule_id: "sch-1", template_id: "tpl-1", report_name: "Weekly" },
      });
    });

    it("execute omits the effect when no schedule id is returned", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsTemplateScheduleCreate: { data: {}, errors: null } },
      });
      const result = await createTemplateScheduleLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toBeUndefined();
    });
  });

  describe("ttd_rerun_report_schedule", () => {
    const input = { scheduleId: "sch-1" };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await rerunReportScheduleLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(ttdService.graphqlQuery).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_requested",
        summary: { schedule_id: "sch-1" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "submit_report",
        canonicalEntityKind: null,
      });
      expect(() => RerunReportScheduleOutputSchema.parse(result)).not.toThrow();
    });

    it("execute emits the effect when a new execution is queued", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsReportScheduleCreate: { data: { id: "exec-9" }, errors: null } },
      });
      const result = await rerunReportScheduleLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toEqual({
        effectKind: "report_requested",
        summary: { schedule_id: "sch-1", report_handle: "exec-9" },
      });
    });

    it("execute omits the effect when the mutation returned errors", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsReportScheduleCreate: { data: null, errors: [{ message: "nope" }] } },
      });
      const result = await rerunReportScheduleLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toBeUndefined();
    });
  });

  describe("ttd_cancel_report_execution", () => {
    const input = { executionId: "exec-1" };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await cancelReportExecutionLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(ttdService.graphqlQuery).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "report_execution_cancelled",
        summary: { execution_id: "exec-1" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "manage",
        canonicalEntityKind: null,
      });
      expect(() => CancelReportExecutionOutputSchema.parse(result)).not.toThrow();
    });

    it("execute emits the effect ONLY when isCancelled === true", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsReportExecutionCancel: { data: { isCancelled: true }, errors: null } },
      });
      const result = await cancelReportExecutionLogic({ ...input } as any, ctx, sdk);
      expect(result.isCancelled).toBe(true);
      expect(result.effect).toEqual({
        effectKind: "report_execution_cancelled",
        summary: { execution_id: "exec-1" },
      });
    });

    it("execute omits the effect when isCancelled === false", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsReportExecutionCancel: { data: { isCancelled: false }, errors: null } },
      });
      const result = await cancelReportExecutionLogic({ ...input } as any, ctx, sdk);
      expect(result.isCancelled).toBe(false);
      expect(result.effect).toBeUndefined();
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    });

    it("execute omits the effect when the outcome is unknown", async () => {
      ttdService.graphqlQuery.mockResolvedValueOnce({
        data: { myReportsReportExecutionCancel: { data: {}, errors: null } },
      });
      const result = await cancelReportExecutionLogic({ ...input } as any, ctx, sdk);
      expect(result.isCancelled).toBeUndefined();
      expect(result.effect).toBeUndefined();
    });
  });

  describe("ttd_execute_entity_report", () => {
    const input = { entityType: "adGroup", entityId: "ag-1", reportType: "AD_GROUP" };

    it("dry_run returns a symbolic effect preview, no API call", async () => {
      const result = await executeEntityReportLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(ttdService.executeEntityReport).not.toHaveBeenCalled();
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "entity_report_executed",
        summary: { entity_type: "adGroup", entity_id: "ag-1", report_type: "AD_GROUP" },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "submit_report",
        canonicalEntityKind: null,
      });
      expect(() => ExecuteEntityReportOutputSchema.parse(result)).not.toThrow();
    });

    it("execute emits the effect with scalar identity (no download URL) when a report is produced", async () => {
      ttdService.executeEntityReport.mockResolvedValueOnce({
        data: {
          adGroupReportExecute: {
            data: { id: "rep-1", url: "https://dl.example/report.csv", hasSampleData: false },
            userErrors: null,
          },
        },
      });
      const result = await executeEntityReportLogic({ ...input } as any, ctx, sdk);
      expect(result.downloadUrl).toBe("https://dl.example/report.csv");
      expect(result.effect).toEqual({
        effectKind: "entity_report_executed",
        summary: {
          entity_type: "adGroup",
          entity_id: "ag-1",
          report_type: "AD_GROUP",
          report_id: "rep-1",
          has_sample_data: false,
        },
      });
      // The download URL must never leak into the effect summary.
      expect(JSON.stringify(result.effect?.summary)).not.toContain("https://");
    });

    it("execute omits the effect when TTD returns user errors", async () => {
      ttdService.executeEntityReport.mockResolvedValueOnce({
        data: {
          adGroupReportExecute: {
            data: {},
            userErrors: [{ field: "reportType", message: "invalid" }],
          },
        },
      });
      const result = await executeEntityReportLogic({ ...input } as any, ctx, sdk);
      expect(result.effect).toBeUndefined();
      expect(result.userErrors?.[0]?.message).toBe("invalid");
    });
  });
});
