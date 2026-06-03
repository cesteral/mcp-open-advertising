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

const TOOL_NAME = "msads_create_report_schedule";
const TOOL_TITLE = "Create Microsoft Ads Report Schedule";
const TOOL_DESCRIPTION = `Create a scheduled report request in Microsoft Advertising.

Submits a report request with a Schedule object, which Microsoft Advertising will re-run on the configured frequency. Returns a scheduleId to reference this schedule.

**Frequency values:** Daily, Weekly, Monthly

**Example schedule:**
\`\`\`json
{
  "StartDate": "2026-04-07",
  "EndDate": "2026-12-31",
  "Frequency": "Weekly"
}
\`\`\`

Note: Microsoft Advertising's API has limited schedule management. Use the UI at app.ads.microsoft.com to view, edit, or delete existing schedules.`;

const EFFECT_KIND = "report_schedule_saved";
const ENTITY_LABEL = "report_schedule";

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
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be schedule creation) without calling the Microsoft Ads API. No schedule is created."
      ),
  })
  .describe("Parameters for creating a scheduled Microsoft Ads report");

export const CreateReportScheduleOutputSchema = z
  .object({
    scheduleId: z
      .string()
      .optional()
      .describe(
        "Schedule ID (ReportRequestId of first scheduled run). Absent on a dry_run (nothing was created)."
      ),
    scheduleName: z.string().optional(),
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

  const { msadsReportingService } = resolveSessionServices(sdkContext);

  const result = await msadsReportingService.createReportSchedule(
    {
      reportType: input.reportType,
      accountId: input.accountId,
      columns: input.columns,
      dateRange: { startDate: input.startDate, endDate: input.endDate },
      aggregation: input.aggregation,
      scheduleName: input.scheduleName,
      schedule: input.schedule as Record<string, unknown>,
    },
    context
  );

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_label: ENTITY_LABEL, schedule_handle: result.scheduleId },
  };

  return {
    scheduleId: result.scheduleId,
    scheduleName: result.scheduleName,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `create_report_schedule`. Validates the request
 * (schedule name non-empty; report date format + ordering — Microsoft Ads'
 * startDate/endDate are free strings, mirroring the parseDate guard the report
 * path applies) and projects the would-be effect. No native validate/preview, so
 * both axes are symbolic. Pure (no I/O).
 */
function buildEffectDryRun(input: CreateReportScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
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
      text: `Scheduled report created: ${result.scheduleId}\nName: ${result.scheduleName}\nTimestamp: ${result.timestamp}`,
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
      requiresValidation: true,
      requiresSimulation: true,
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
