// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import {
  MYREPORTS_TEMPLATE_ACCESS_ERROR,
  throwIfGraphqlErrors,
} from "../utils/graphql-errors.js";

const SUPPORTED_REPORT_FREQUENCIES = ["SINGLE_RUN", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"] as const;
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
- \`reportFilters\` scopes the report to specific partners/advertisers — omit to run across all accessible entities
- \`startDate\` sets when the first run occurs (ISO 8601, e.g. \`2025-10-10T00:00:00Z\`)

Use \`ttd_list_report_schedules\` to see existing schedules and \`ttd_list_report_templates\` to find template IDs.`;

const ReportFilterSchema = z.object({
  reportType: z.string().describe("Report type ID to filter on"),
  partnerIds: z.array(z.string()).optional().describe("Limit report to these partner IDs"),
  advertiserIds: z.array(z.string()).optional().describe("Limit report to these advertiser IDs"),
});

const TailAggregationSchema = z.object({
  columnId: z.string().describe("Column ID for the tail aggregation"),
  tailAggregation: z
    .string()
    .describe("Tail aggregation type, e.g. NO_IMPRESSIONS"),
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
    frequency: z
      .enum(SUPPORTED_REPORT_FREQUENCIES)
      .describe("How often the report runs"),
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
      .optional()
      .describe("Scope the report to specific partners or advertisers"),
    suppressTotals: z
      .boolean()
      .optional()
      .describe("Suppress totals row in the report output"),
    suppressZeroMeasureRows: z
      .boolean()
      .optional()
      .describe("Suppress rows where all metrics are zero"),
    dateFormat: z
      .enum(SUPPORTED_REPORT_DATE_FORMATS)
      .optional()
      .describe("Date format for the report output. Supported value: International"),
    numericFormat: z
      .enum(SUPPORTED_REPORT_NUMERIC_FORMATS)
      .optional()
      .describe("Numeric format for the report output. Supported value: US"),
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
      ...(input.reportFilters !== undefined && { reportFilters: input.reportFilters }),
      ...(input.suppressTotals !== undefined && { suppressTotals: input.suppressTotals }),
      ...(input.suppressZeroMeasureRows !== undefined && {
        suppressZeroMeasureRows: input.suppressZeroMeasureRows,
      }),
      ...(input.dateFormat !== undefined && { dateFormat: input.dateFormat }),
      ...(input.numericFormat !== undefined && { numericFormat: input.numericFormat }),
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
  const errors = mutationResult.errors as
    | Array<{ field?: string; message: string }>
    | undefined;

  return {
    scheduleId: scheduleData.scheduleId as string | undefined,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function createTemplateScheduleResponseFormatter(
  result: CreateTemplateScheduleOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Template schedule creation failed:\n\n` +
          result.errors
            .map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`)
            .join("\n") +
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
