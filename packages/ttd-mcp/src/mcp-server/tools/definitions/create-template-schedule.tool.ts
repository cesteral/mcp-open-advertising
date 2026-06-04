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
import { MYREPORTS_TEMPLATE_ACCESS_ERROR, throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const SUPPORTED_REPORT_FREQUENCIES = [
  "SINGLE_RUN",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
] as const;
const SUPPORTED_REPORT_FORMATS = ["EXCEL"] as const;
const SUPPORTED_REPORT_DATE_FORMATS = ["International"] as const;
const SUPPORTED_REPORT_NUMERIC_FORMATS = ["US"] as const;
const ianaTimeZones =
  typeof Intl.supportedValuesOf === "function"
    ? new Set(Intl.supportedValuesOf("timeZone"))
    : undefined;

const TOOL_NAME = "ttd_create_template_schedule";
const TOOL_TITLE = "Create TTD Template Report Schedule (GraphQL)";
const TOOL_DESCRIPTION = `Create a report schedule from a template ID via TTD GraphQL (\`myReportsTemplateScheduleCreate\`).

This is the step after \`ttd_create_report_template\` — it links an existing report template to a schedule that controls when and how often the report runs.

**Workflow:**
1. Use \`ttd_create_report_template\` to create a template defining report structure
2. Call this tool with the returned template ID to schedule execution
3. Use \`ttd_get_report_executions\` to check execution status and retrieve download links when complete

**Tips:**
- Use \`frequency: SINGLE_RUN\` for one-time on-demand reports
- \`reportFilters\` is **required** — each entry needs a \`reportType\` plus at least one of \`partnerIds\` or \`advertiserIds\`
- \`startDate\` sets when the first run occurs (ISO 8601, e.g. \`2025-10-10T00:00:00Z\`)

Use \`ttd_list_report_schedules\` to see existing schedules and \`ttd_list_report_templates\` to find template IDs.`;

const EFFECT_KIND = "report_schedule_saved";

const ReportFilterSchema = z.object({
  reportType: z.string().describe("Report type ID to filter on"),
  partnerIds: z.array(z.string()).optional().describe("Limit report to these partner IDs"),
  advertiserIds: z.array(z.string()).optional().describe("Limit report to these advertiser IDs"),
});

const TailAggregationSchema = z.object({
  columnId: z.string().describe("Column ID for the tail aggregation"),
  tailAggregation: z.string().describe("Tail aggregation type, e.g. NO_IMPRESSIONS"),
});

const TimezoneSchema = z
  .string()
  .default("UTC")
  .refine(
    (value) => value === "UTC" || ianaTimeZones?.has(value) === true,
    "Timezone must be a valid IANA/Olson timezone, e.g. UTC or America/New_York"
  );

export const CreateTemplateScheduleInputSchema = z
  .object({
    templateId: z.string().min(1).describe("ID of the report template to schedule"),
    reportName: z.string().min(1).describe("Display name for this schedule"),
    startDate: z
      .string()
      .describe("ISO 8601 datetime for the first run, e.g. 2025-10-10T00:00:00Z"),
    frequency: z.enum(SUPPORTED_REPORT_FREQUENCIES).describe("How often the report runs"),
    dateRange: z
      .string()
      .describe(
        "Date range for the report data, e.g. LAST7_DAYS, LAST14_DAYS, LAST30_DAYS, YESTERDAY, CUSTOM"
      ),
    timezone: TimezoneSchema.describe("Timezone for report execution (default: UTC)"),
    format: z
      .enum(SUPPORTED_REPORT_FORMATS)
      .default("EXCEL")
      .describe("Report output format (currently only EXCEL is supported)"),
    includeHeaders: z
      .boolean()
      .default(true)
      .describe("Whether to include column headers in the output"),
    reportFilters: z
      .array(ReportFilterSchema)
      .min(1)
      .describe(
        "Required. Scope the report to specific partners or advertisers. " +
          "Each entry must include a reportType and at least one of partnerIds, advertiserIds, campaignIds, etc."
      ),
    suppressTotals: z.boolean().default(false).describe("Suppress totals row in the report output"),
    suppressZeroMeasureRows: z
      .boolean()
      .default(false)
      .describe("Suppress rows where all metrics are zero"),
    dateFormat: z
      .enum(SUPPORTED_REPORT_DATE_FORMATS)
      .default("International")
      .describe("Date format for the report output (default: International)"),
    numericFormat: z
      .enum(SUPPORTED_REPORT_NUMERIC_FORMATS)
      .default("US")
      .describe("Numeric format for the report output (default: US)"),
    conversionMetricOrdering: z
      .string()
      .optional()
      .describe(
        "How conversion metrics are ordered in the report, e.g. ALPHABETICALLY_BY_COLUMN_NAMES"
      ),
    tailAggregations: z
      .union([TailAggregationSchema, z.array(TailAggregationSchema).min(1)])
      .optional()
      .describe("Tail aggregation configuration for the report"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the schedule request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be schedule creation) without calling the TTD API. No schedule is created."
      ),
  })
  .describe("Parameters for creating a TTD template report schedule");

export const CreateTemplateScheduleOutputSchema = z
  .object({
    scheduleId: z.string().optional().describe("ID of the created report schedule"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No schedule was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_schedule_saved` + scalar audit summary). Present only on a confirmed create the mutation returned a schedule id for. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `create_schedule` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Result of report schedule creation from template");

type CreateTemplateScheduleInput = z.infer<typeof CreateTemplateScheduleInputSchema>;
type CreateTemplateScheduleOutput = z.infer<typeof CreateTemplateScheduleOutputSchema>;

const CREATE_TEMPLATE_SCHEDULE_MUTATION = `mutation CreateTemplateSchedule($input: MyReportsTemplateScheduleCreateInput!) {
  myReportsTemplateScheduleCreate(input: $input) {
    data {
      scheduleId
    }
    errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }
  }
}`;

export async function createTemplateScheduleLogic(
  input: CreateTemplateScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateTemplateScheduleOutput> {
  // Effect-class write: a report schedule is not a canonical ad entity, so there
  // is no entity snapshot. The capability is `create_schedule` with a null kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "create_schedule",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the schedule request and project the would-be
  // effect. No API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      templateId: input.templateId,
      reportName: input.reportName,
      startDate: input.startDate,
      frequency: input.frequency,
      dateRange: input.dateRange,
      timezone: input.timezone,
      format: input.format,
      includeHeaders: input.includeHeaders,
      reportFilters: input.reportFilters,
      suppressTotals: input.suppressTotals ?? false,
      suppressZeroMeasureRows: input.suppressZeroMeasureRows ?? false,
      dateFormat: (input.dateFormat ?? "International").toUpperCase(),
      numericFormat: input.numericFormat ?? "US",
      ...(input.conversionMetricOrdering !== undefined && {
        conversionMetricOrdering: input.conversionMetricOrdering,
      }),
      ...(input.tailAggregations !== undefined && {
        tailAggregations: Array.isArray(input.tailAggregations)
          ? input.tailAggregations
          : [input.tailAggregations],
      }),
    },
  };

  const raw = (await ttdService.graphqlQuery(
    CREATE_TEMPLATE_SCHEDULE_MUTATION,
    variables,
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error creating template schedule", {
    unauthorizedMessage: MYREPORTS_TEMPLATE_ACCESS_ERROR,
  });

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult =
    (gqlData.myReportsTemplateScheduleCreate as Record<string, unknown> | undefined) ?? {};
  const scheduleData = (mutationResult.data as Record<string, unknown> | undefined) ?? {};
  const errors = mutationResult.errors as Array<{ field?: string; message: string }> | undefined;
  const scheduleId = scheduleData.scheduleId as string | undefined;

  // Effect emitted only when the mutation returned a schedule id and no errors —
  // the definitive signal the schedule was created. The summary uses stable
  // scalar identities only.
  const effect: EffectResult | undefined =
    scheduleId && !errors?.length
      ? {
          effectKind: EFFECT_KIND,
          summary: {
            schedule_id: scheduleId,
            template_id: input.templateId,
            report_name: input.reportName,
          },
        }
      : undefined;

  return {
    scheduleId,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `create_template_schedule`. TTD GraphQL has no
 * native schedule validate/preview, so both axes are symbolic. Validates the
 * template id, report name, and start date are non-empty and every report filter
 * carries a report type plus at least one partner/advertiser scope, then projects
 * the scalar would-be effect. Pure (no I/O).
 */
function buildEffectDryRun(input: CreateTemplateScheduleInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.templateId.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_TEMPLATE_ID",
      message: "templateId must be a non-empty report-template id",
      field: "templateId",
    });
  }
  if (input.reportName.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_REPORT_NAME",
      message: "reportName must be a non-empty schedule name",
      field: "reportName",
    });
  }
  if (input.startDate.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_START_DATE",
      message: "startDate must be an ISO 8601 datetime for the first run",
      field: "startDate",
    });
  }
  input.reportFilters.forEach((f, i) => {
    if (f.reportType.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_REPORT_TYPE",
        message: `reportFilters[${i}].reportType must reference a report type`,
        field: `reportFilters[${i}].reportType`,
      });
    }
    const hasScope = (f.partnerIds?.length ?? 0) > 0 || (f.advertiserIds?.length ?? 0) > 0;
    if (!hasScope) {
      validationErrors.push({
        code: "MISSING_FILTER_SCOPE",
        message: `reportFilters[${i}] must include at least one of partnerIds or advertiserIds`,
        field: `reportFilters[${i}]`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { template_id: input.templateId, report_name: input.reportName },
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

export function createTemplateScheduleResponseFormatter(
  result: CreateTemplateScheduleOutput
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
          `Dry run: creating a template report schedule ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No schedule was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Template schedule creation failed:\n\n` +
          result.errors.map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`).join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.scheduleId) {
    return [
      {
        type: "text" as const,
        text:
          `Template report schedule created successfully.\n\n` +
          `Schedule ID: ${result.scheduleId}\n` +
          `\nUse \`ttd_get_report_executions\` with this schedule ID to check status and retrieve the download link.\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Template schedule creation result:\n\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createTemplateScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateTemplateScheduleInputSchema,
  outputSchema: CreateTemplateScheduleOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "create_template_schedule",
      operation: ["create_schedule"],
      // Effect-class: report schedules have no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.create_template_schedule.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a weekly schedule from a template",
      input: {
        templateId: "tpl-abc123",
        reportName: "Weekly Performance Report",
        startDate: "2025-10-10T00:00:00Z",
        frequency: "WEEKLY",
        dateRange: "LAST7_DAYS",
        timezone: "UTC",
        format: "EXCEL",
        includeHeaders: true,
        reportFilters: [
          {
            reportType: "1",
            partnerIds: ["partner-id"],
          },
        ],
      },
    },
    {
      label: "Create a one-time schedule scoped to an advertiser",
      input: {
        templateId: "tpl-xyz789",
        reportName: "Q3 Advertiser Wrap-up",
        startDate: "2025-10-01T00:00:00Z",
        frequency: "SINGLE_RUN",
        dateRange: "LAST30_DAYS",
        timezone: "America/New_York",
        format: "EXCEL",
        includeHeaders: true,
        reportFilters: [
          {
            reportType: "60",
            advertiserIds: ["adv-111", "adv-222"],
          },
        ],
        suppressZeroMeasureRows: true,
      },
    },
  ],
  logic: createTemplateScheduleLogic,
  responseFormatter: createTemplateScheduleResponseFormatter,
};
