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
  McpTextContent,
  RequestContext,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "ttd_create_report_schedule";
const TOOL_TITLE = "Create TTD Report Schedule";
const TOOL_DESCRIPTION = `Create a named report schedule (Once, Daily, Weekly, or Monthly).

This is a legacy-friendly REST wrapper for the MyReports schedule endpoint.
Use this when you already know the REST payload shape or need compatibility with older callers.

Report templates and report schedules are distinct in TTD:
- A **template** defines report structure
- A **schedule** controls when a template runs

For the docs-aligned GraphQL workflow, prefer:
- \`ttd_create_report_template\`
- \`ttd_create_template_schedule\`
- \`ttd_get_report_executions\`

For a one-off blocking report use \`ttd_get_report\`.
For a one-off non-blocking report use \`ttd_submit_report\`.

**Recurring schedules** (Daily/Weekly/Monthly) persist in TTD and run automatically.
Use \`ttd_list_report_schedules\` to view and \`ttd_delete_report_schedule\` to remove them.

For custom date ranges pass \`ReportStartDate\` / \`ReportEndDate\` in \`additionalConfig\`.`;

const EFFECT_KIND = "report_schedule_saved";
const ENTITY_LABEL = "report_schedule";

export const CreateReportScheduleInputSchema = z
  .object({
    reportName: z.string().min(1).describe("Name for the report schedule"),
    scheduleType: z
      .enum(["Once", "Daily", "Weekly", "Monthly", "Quarterly"])
      .describe("How often the report runs (per TTD MyReports reportschedule/facets)"),
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
      .describe("Date range for the report data"),
    fileFormat: z
      .enum(["CSV", "TSV", "ExcelPivot"])
      .optional()
      .default("CSV")
      .describe(
        "Report file format. Must match the template's format. Use ExcelPivot for Excel-shaped templates."
      ),
    scheduleStartDate: z
      .string()
      .optional()
      .describe("ISO datetime; defaults to today UTC at 00:00. Required by TTD."),
    dimensions: z
      .array(z.string())
      .optional()
      .describe(
        "Report dimensions (e.g. AdvertiserId, CampaignId, AdGroupId, Date, Country). " +
          "See the report-reference resource for the full list of 188 available dimensions."
      ),
    metrics: z
      .array(z.string())
      .optional()
      .describe(
        "Report metrics (e.g. Impressions, Clicks, TotalCost, CTR, ROAS). " +
          "See the report-reference resource for the full list of 318 available metrics."
      ),
    advertiserIds: z
      .array(z.string())
      .optional()
      .describe("Filter report to specific advertiser IDs"),
    reportTemplateId: z
      .number()
      .describe(
        "TTD report template ID — REQUIRED by TTD. Find IDs via ttd_list_report_templates or the TTD UI."
      ),
    additionalConfig: z
      .record(z.unknown())
      .optional()
      .describe(
        "Additional TTD report config fields passed verbatim to the API. " +
          "Useful for: ReportStartDate / ReportEndDate (Custom range), delivery email settings, etc."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be schedule creation) without calling the TTD API. No schedule is created."
      ),
  })
  .describe("Parameters for creating a TTD report schedule");

export const CreateReportScheduleOutputSchema = z
  .object({
    reportScheduleId: z
      .string()
      .optional()
      .describe("The created report schedule ID. Absent on a dry_run (nothing was created)."),
    reportName: z.string().optional(),
    scheduleType: z.string().optional(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No schedule was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_schedule_saved` + scalar audit summary). Present on a confirmed execute. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `create_schedule` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Created report schedule");

type CreateReportScheduleInput = z.infer<typeof CreateReportScheduleInputSchema>;
type CreateReportScheduleOutput = z.infer<typeof CreateReportScheduleOutputSchema>;

export async function createReportScheduleLogic(
  input: CreateReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateReportScheduleOutput> {
  // Effect-class write: a report schedule is not a canonical ad entity, so there
  // is no entity snapshot. The capability is `create_schedule` with a null kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "create_schedule",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect
  // (a report-schedule creation). No API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const startDate = input.scheduleStartDate ?? new Date().toISOString().slice(0, 10) + "T00:00:00";

  const config = {
    ReportScheduleName: input.reportName,
    ReportTemplateId: input.reportTemplateId,
    ReportFileFormat: input.fileFormat,
    ReportDateRange: input.dateRange,
    ReportFrequency: input.scheduleType,
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

  const result = await ttdReportingService.createReportSchedule(config, context);

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_label: ENTITY_LABEL, schedule_handle: result.reportScheduleId },
  };

  return {
    reportScheduleId: result.reportScheduleId,
    reportName: input.reportName,
    scheduleType: input.scheduleType,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `create_report_schedule`. Validates the request
 * (report name non-empty; reportTemplateId a positive integer — Zod's
 * `z.number()` admits floats, zero, and negatives) and projects the would-be
 * effect. TTD has no native validate/preview, so both axes are symbolic. Pure
 * (no I/O).
 */
function buildEffectDryRun(input: CreateReportScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.reportName.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_REPORT_NAME",
      message: "reportName must be a non-empty schedule name",
      field: "reportName",
    });
  }
  if (!Number.isInteger(input.reportTemplateId) || input.reportTemplateId <= 0) {
    validationErrors.push({
      code: "INVALID_TEMPLATE_ID",
      message: `reportTemplateId must be a positive integer — got ${String(input.reportTemplateId)}`,
      field: "reportTemplateId",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_label: ENTITY_LABEL },
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

export function createReportScheduleResponseFormatter(
  result: CreateReportScheduleOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: creating a report schedule ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No schedule was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text:
        `Report schedule created: ${result.reportScheduleId}\n` +
        `Name: ${result.reportName}\n` +
        `Type: ${result.scheduleType}\n\n` +
        (result.scheduleType === "Once"
          ? `Use \`ttd_check_report_status\` with scheduleId "${result.reportScheduleId}" to poll for completion.\n`
          : `Recurring schedule saved. Use \`ttd_list_report_schedules\` to view all schedules.\n`) +
        `\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createReportScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateReportScheduleInputSchema,
  outputSchema: CreateReportScheduleOutputSchema,
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
      contractToolSlug: "create_report_schedule",
      operation: ["create_schedule"],
      // Effect-class: report schedules have no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.create_report_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Daily campaign performance schedule",
      input: {
        reportName: "Daily Campaign Performance",
        scheduleType: "Daily",
        dateRange: "Yesterday",
        dimensions: ["CampaignId", "Date"],
        metrics: ["Impressions", "Clicks", "TotalCost", "CTR"],
        advertiserIds: ["adv123"],
      },
    },
    {
      label: "One-time custom date range report",
      input: {
        reportName: "Q1 2025 Review",
        scheduleType: "Once",
        dateRange: "Custom",
        dimensions: ["AdvertiserId", "CampaignId"],
        metrics: ["Impressions", "TotalCost", "ROAS"],
        additionalConfig: {
          ReportStartDate: "2025-01-01",
          ReportEndDate: "2025-03-31",
        },
      },
    },
  ],
  logic: createReportScheduleLogic,
  responseFormatter: createReportScheduleResponseFormatter,
};
