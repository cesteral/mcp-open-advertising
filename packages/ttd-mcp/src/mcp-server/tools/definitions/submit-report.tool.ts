// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "ttd_submit_report";
const TOOL_TITLE = "Submit TTD Report";
const TOOL_DESCRIPTION = `Submit a report to The Trade Desk without waiting for completion.

Returns a \`reportScheduleId\` immediately. Use \`ttd_check_report_status\` to poll for completion, then \`ttd_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`ttd_submit_report\` → get \`reportScheduleId\`
2. \`ttd_check_report_status\` (repeat every 5-10s) → wait for "Complete"
3. \`ttd_download_report\` with the \`downloadUrl\` → get a bounded summary or paged row slice

Use \`ttd_get_report\` instead for a blocking convenience shortcut.`;

const REPORT_TYPE = "templated";

export const SubmitReportInputSchema = z
  .object({
    reportName: z.string().describe("Name for the report"),
    dateRange: z
      .enum([
        "Yesterday",
        "Last7Days",
        "Last14Days",
        "Last30Days",
        "LastXDays",
        "MonthToDate",
        "LastMonth",
        "QuarterToDate",
        "LastQuarter",
        "YearToDate",
        "Custom",
      ])
      .describe("Date range for the report (per TTD MyReports reportschedule/facets)"),
    reportTemplateId: z
      .number()
      .describe(
        "TTD report template ID — REQUIRED by TTD. Find IDs via ttd_list_report_templates or the TTD UI."
      ),
    fileFormat: z
      .enum(["CSV", "TSV", "ExcelPivot"])
      .optional()
      .default("CSV")
      .describe(
        "Report file format. Must match the template's format: CSV/TSV templates accept CSV or TSV; Excel-shaped templates require `ExcelPivot`. CSV download parsing only works with CSV/TSV outputs."
      ),
    scheduleStartDate: z
      .string()
      .optional()
      .describe(
        "ISO date or datetime when the schedule should first run. Defaults to today UTC at 00:00. Required by TTD for one-time schedules."
      ),
    advertiserIds: z.array(z.string()).optional().describe("Filter by advertiser IDs"),
    dimensions: z
      .array(z.string())
      .optional()
      .describe(
        "(legacy/ignored when ReportTemplateId is set) Report dimensions — TTD now requires a template."
      ),
    metrics: z
      .array(z.string())
      .optional()
      .describe(
        "(legacy/ignored when ReportTemplateId is set) Report metrics — TTD now requires a template."
      ),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields (merged last)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the report request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report submission) without calling the TTD API. No report schedule is created."
      ),
  })
  .describe("Parameters for submitting a TTD report");

export const SubmitReportOutputSchema = z
  .object({
    reportScheduleId: z
      .string()
      .optional()
      .describe(
        "Report schedule ID for status polling. Absent on a dry_run (nothing was submitted)."
      ),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No report was submitted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_requested` + scalar audit summary). Present on a confirmed execute. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `submit_report` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Report submission result");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  // Effect-class write: no canonical entity snapshot. The capability is
  // `submit_report` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "submit_report",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect
  // (a report submission). No API call.
  if (input.dry_run === true) {
    const dryRun = buildSubmitReportEffectDryRun(input);
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const startDate = input.scheduleStartDate ?? new Date().toISOString().slice(0, 10) + "T00:00:00";

  const reportConfig = {
    ReportScheduleName: input.reportName,
    ReportTemplateId: input.reportTemplateId,
    ReportFileFormat: input.fileFormat,
    ReportDateRange: input.dateRange,
    ReportFrequency: "Once" as const,
    ScheduleStartDate: startDate,
    TimeZone: "UTC",
    ReportDateFormat: "Sortable",
    ReportNumericFormat: "US",
    IncludeHeaders: true,
    ...(input.dimensions && { ReportDimensions: input.dimensions }),
    ...(input.metrics && { ReportMetrics: input.metrics }),
    ...(input.advertiserIds && { AdvertiserFilters: input.advertiserIds }),
    ...input.additionalConfig,
  };

  const result = await ttdReportingService.createReportSchedule(reportConfig, context);

  const effect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: REPORT_TYPE, report_handle: result.reportScheduleId },
  };

  return {
    reportScheduleId: result.reportScheduleId,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `submit_report`. Validates the request (report
 * template ID must be a positive integer — Zod's `z.number()` admits floats,
 * zero, and negatives) and projects the would-be effect (a report submission).
 * TTD has no native report validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildSubmitReportEffectDryRun(input: SubmitReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (!Number.isInteger(input.reportTemplateId) || input.reportTemplateId <= 0) {
    validationErrors.push({
      code: "INVALID_TEMPLATE_ID",
      message: `reportTemplateId must be a positive integer — got ${String(input.reportTemplateId)}`,
      field: "reportTemplateId",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: "report_requested",
    summary: { report_type: REPORT_TYPE },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const rt = result.dryRun.expectedEffect?.summary.report_type ?? "report";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: submitting a ${String(rt)} report ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No report was submitted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.reportScheduleId}\n\nUse \`ttd_check_report_status\` with this reportScheduleId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const submitReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SubmitReportInputSchema,
  outputSchema: SubmitReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "submit_report",
      operation: ["submit_report"],
      // Effect-class: an async report submission with no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.submit_report.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. TTD has no
      // native report validate/preview, so both axes are symbolic (honest true).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Submit Yesterday report (Excel template)",
      input: {
        reportName: "Daily Performance",
        dateRange: "Yesterday",
        reportTemplateId: 16353,
        fileFormat: "ExcelPivot",
        advertiserIds: ["adv123abc"],
      },
    },
    {
      label: "Submit Last 7 Days report (CSV template)",
      input: {
        reportName: "Weekly Performance",
        dateRange: "Last7Days",
        reportTemplateId: 12345,
        fileFormat: "CSV",
        advertiserIds: ["adv123abc"],
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
