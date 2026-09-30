// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  McpError,
  JsonRpcErrorCode,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "msads_create_report_schedule";
const TOOL_TITLE = "Create Microsoft Ads Report Schedule";
const TOOL_DESCRIPTION = `NOT SUPPORTED — always fails without calling Microsoft Advertising. Nothing is scheduled.

The Microsoft Advertising Reporting API v13 has no report schedules: it exposes only GenerateReport/Submit and GenerateReport/Poll, and ReportRequest has no Schedule element. No API call can create, list or delete a report schedule.

For a one-off report use msads_submit_report + msads_check_report_status, or msads_get_report.`;

/**
 * Microsoft Advertising Reporting v13 has no schedule surface. Per the
 * MicrosoftDocs/Advertising `reporting-service` reference, the only REST
 * operations are `POST /Reporting/v13/GenerateReport/Submit` and
 * `.../GenerateReport/Poll`, and `reportrequest.md` /
 * `campaignperformancereportrequest.md` list no `Schedule` element. The tool
 * previously sent `ReportRequest.Schedule` anyway and returned the one-off
 * ReportRequestId as a "scheduleId". It is kept (rather than removed) so the
 * published tool surface stays stable, but it now refuses every call.
 */
export const MSADS_NO_REPORT_SCHEDULES_MESSAGE =
  "Microsoft Advertising Reporting API v13 has no report schedules — it exposes only GenerateReport/Submit and GenerateReport/Poll, and ReportRequest has no Schedule element. Nothing was scheduled. Run a one-off report with msads_submit_report / msads_get_report instead.";

export const CreateReportScheduleInputSchema = z
  .object({
    accountId: z.string().describe("Microsoft Ads Account ID"),
    scheduleName: z.string().min(1).describe("Name for the scheduled report"),
    reportType: z.string().describe("Report type (e.g., CampaignPerformanceReportRequest)"),
    columns: z.array(z.string()).min(1).describe("Report columns to include"),
    startDate: z.string().describe("Report data start date (YYYY-MM-DD)"),
    endDate: z.string().describe("Report data end date (YYYY-MM-DD)"),
    aggregation: z
      .string()
      .optional()
      .describe("Time aggregation (Daily, Weekly, Monthly). Default: Daily"),
    schedule: z
      .object({
        StartDate: z.string().describe("Schedule start date (YYYY-MM-DD)"),
        EndDate: z.string().optional().describe("Schedule end date (YYYY-MM-DD)"),
        Frequency: z.enum(["Daily", "Weekly", "Monthly"]).describe("How often the report runs"),
      })
      .describe("Schedule configuration"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, returns an EffectDryRunResult under `dryRun` that always reports wouldSucceed: false (Microsoft Advertising has no report schedules). Never calls the Microsoft Ads API."
      ),
  })
  .describe("Parameters for creating a scheduled Microsoft Ads report");

export const CreateReportScheduleOutputSchema = z
  .object({
    scheduleId: z
      .string()
      .optional()
      .describe(
        "Never populated: Microsoft Advertising has no report schedules, so this tool creates nothing."
      ),
    scheduleName: z.string().optional(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No schedule was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Never emitted: every execute call fails, so no schedule is ever saved."
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
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<CreateReportScheduleOutput> {
  // Effect-class write: a report schedule is not a canonical ad entity, so there
  // is no entity snapshot. The capability is `create_schedule` with a null kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "create_schedule",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: always reports that the call cannot succeed. No API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // No Microsoft Advertising operation creates a report schedule; refuse
  // rather than submit a one-off report and call it a schedule.
  throw new McpError(JsonRpcErrorCode.InvalidRequest, MSADS_NO_REPORT_SCHEDULES_MESSAGE, {
    platform: "msads",
    tool: TOOL_NAME,
    unsupported: true,
  });
}

/**
 * Symbolic effect dry-run for `create_report_schedule`. Always fails with an
 * UNSUPPORTED_OPERATION error (Microsoft Advertising has no report schedules);
 * the input checks still run so a caller sees every problem at once. There is
 * no effect to simulate, so the contract declares requiresSimulation: false and
 * the dry-run carries no expected effect. Pure (no I/O).
 */
function buildEffectDryRun(input: CreateReportScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [
    {
      code: "UNSUPPORTED_OPERATION",
      message: MSADS_NO_REPORT_SCHEDULES_MESSAGE,
      field: "schedule",
    },
  ];
  if (input.scheduleName.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_SCHEDULE_NAME",
      message: "scheduleName must be a non-empty schedule name",
      field: "scheduleName",
    });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const startOk = dateRe.test(input.startDate);
  const endOk = dateRe.test(input.endDate);
  if (!startOk) {
    validationErrors.push({
      code: "INVALID_DATE_FORMAT",
      message: `startDate must be YYYY-MM-DD — got "${input.startDate}"`,
      field: "startDate",
    });
  }
  if (!endOk) {
    validationErrors.push({
      code: "INVALID_DATE_FORMAT",
      message: `endDate must be YYYY-MM-DD — got "${input.endDate}"`,
      field: "endDate",
    });
  }
  if (startOk && endOk && input.startDate > input.endDate) {
    validationErrors.push({
      code: "INVALID_DATE_RANGE",
      message: `startDate (${input.startDate}) must be on or before endDate (${input.endDate})`,
      field: "startDate",
    });
  }

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: false,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "none",
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: false }
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
          `Dry run: creating a report schedule ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Microsoft Advertising has no report schedules; no schedule was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${MSADS_NO_REPORT_SCHEDULES_MESSAGE}\n\nTimestamp: ${result.timestamp}`,
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
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "create_report_schedule",
      operation: ["create_schedule"],
      // Effect-class: report schedules have no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.create_report_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      // Honest contract booleans: the request is validated symbolically, but
      // Microsoft Ads has no report schedules, so there is never an effect to
      // simulate (requiresSimulation: false) and every execute call fails.
      requiresValidation: true,
      requiresSimulation: false,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Weekly campaign performance schedule",
      input: {
        accountId: "123456789",
        scheduleName: "Weekly Campaign Report",
        reportType: "CampaignPerformanceReportRequest",
        columns: ["CampaignName", "Impressions", "Clicks", "Spend", "Conversions"],
        startDate: "2026-04-07",
        endDate: "2026-04-13",
        aggregation: "Daily",
        schedule: {
          StartDate: "2026-04-07",
          EndDate: "2026-12-31",
          Frequency: "Weekly",
        },
      },
    },
  ],
  logic: createReportScheduleLogic,
  responseFormatter: createReportScheduleResponseFormatter,
};
