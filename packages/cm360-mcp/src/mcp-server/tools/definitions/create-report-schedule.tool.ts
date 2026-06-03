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
import {
  buildTypedReportConfig,
  CM360ReportTypeSchema,
  CM360ScheduleSchema,
  genericCriteriaSchema,
  getReportCriteriaFromConfig,
  validateScheduleCompatibility,
  validateTypedCriteriaUsage,
} from "../utils/report-config.js";

const TOOL_NAME = "cm360_create_report_schedule";
const TOOL_TITLE = "Create CM360 Report Schedule";
const TOOL_DESCRIPTION = `Create a CM360 report with a recurring schedule.

CM360 schedules are embedded in the report resource itself. The returned reportId is your schedule handle — use it with cm360_list_report_schedules and cm360_delete_report_schedule.

**Schedule frequency values:** DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY

**Example schedule object:**
\`\`\`json
{
  "active": true,
  "every": 1,
  "repeats": "WEEKLY",
  "repeatsOnWeekDays": ["MONDAY"],
  "startDate": "2026-04-01",
  "expirationDate": "2026-12-31"
}
\`\`\``;

const EFFECT_KIND = "report_schedule_saved";
const ENTITY_LABEL = "report_schedule";

export const CreateReportScheduleInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    name: z.string().min(1).describe("Name for the scheduled report"),
    type: CM360ReportTypeSchema.describe("Report type"),
    schedule: CM360ScheduleSchema.describe("Schedule configuration"),
    criteria: genericCriteriaSchema.optional().describe("Criteria for STANDARD reports"),
    reachCriteria: genericCriteriaSchema.optional().describe("Criteria for REACH reports"),
    pathToConversionCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for PATH_TO_CONVERSION reports"),
    floodlightCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for FLOODLIGHT reports"),
    crossMediaReachCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for CROSS_MEDIA_REACH reports"),
    delivery: z
      .record(z.any())
      .optional()
      .describe("Delivery configuration (emailOwner, recipients, etc.)"),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be schedule creation) without calling the CM360 API. No schedule is created."
      ),
  })
  .superRefine((input, ctx) => {
    validateTypedCriteriaUsage(input as Parameters<typeof validateTypedCriteriaUsage>[0], ctx);
    validateScheduleCompatibility(input.type, getReportCriteriaFromConfig(input, input.type), ctx);
  })
  .describe("Parameters for creating a scheduled CM360 report");

export const CreateReportScheduleOutputSchema = z
  .object({
    reportId: z
      .string()
      .optional()
      .describe("Report ID (use as schedule handle). Absent on a dry_run (nothing was created)."),
    reportName: z.string().optional(),
    schedule: z.record(z.any()).optional().describe("Schedule as returned by CM360"),
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

  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const reportConfig = {
    ...buildTypedReportConfig(input),
    schedule: input.schedule as Record<string, unknown>,
    ...(input.delivery ? { delivery: input.delivery } : {}),
  };

  const result = await cm360ReportingService.createReportSchedule(
    input.profileId,
    reportConfig as Parameters<typeof cm360ReportingService.createReportSchedule>[1],
    context
  );

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_label: ENTITY_LABEL, schedule_handle: result.reportId },
  };

  return {
    reportId: result.reportId,
    reportName: result.reportName,
    schedule: result.schedule,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `create_report_schedule`. Validates the request
 * (report name non-empty — guards against whitespace-only names Zod's `.min(1)`
 * admits) and projects the would-be effect (a report-schedule creation). CM360
 * has no native validate/preview, so both axes are symbolic. Pure (no I/O).
 */
function buildEffectDryRun(input: CreateReportScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.name.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_REPORT_NAME",
      message: "name must be a non-empty report name",
      field: "name",
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
      text: `Scheduled report created: ${result.reportId}\nName: ${result.reportName}\nSchedule: ${JSON.stringify(result.schedule, null, 2)}\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "cm360",
      contractPlatformSlug: "cm360",
      contractToolSlug: "create_report_schedule",
      operation: ["create_schedule"],
      // Effect-class: report schedules have no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "cm360.create_report_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Weekly standard report every Monday",
      input: {
        profileId: "123456",
        name: "Weekly Campaign Performance",
        type: "STANDARD",
        schedule: {
          active: true,
          every: 1,
          repeats: "WEEKLY",
          repeatsOnWeekDays: ["MONDAY"],
          startDate: "2026-04-07",
          expirationDate: "2026-12-31",
        },
        criteria: {
          dateRange: { relativeDateRange: "LAST_7_DAYS" },
          metricNames: ["impressions", "clicks", "mediaCost"],
        },
      },
    },
    {
      label: "Monthly floodlight report",
      input: {
        profileId: "123456",
        name: "Monthly Floodlight Summary",
        type: "FLOODLIGHT",
        schedule: {
          active: true,
          every: 1,
          repeats: "MONTHLY",
          runsOnDayOfMonth: "DAY_OF_MONTH",
          startDate: "2026-04-01",
        },
        floodlightCriteria: {
          dateRange: { relativeDateRange: "LAST_MONTH" },
          metricNames: ["floodlightImpressions", "floodlightRevenue"],
        },
      },
    },
  ],
  logic: createReportScheduleLogic,
  responseFormatter: createReportScheduleResponseFormatter,
};
