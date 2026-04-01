// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

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

export const CreateReportScheduleInputSchema = z
  .object({
    reportName: z.string().min(1).describe("Name for the report schedule"),
    scheduleType: z
      .enum(["Once", "Daily", "Weekly", "Monthly"])
      .describe("How often the report runs"),
    dateRange: z
      .enum([
        "Last7Days",
        "Last14Days",
        "Last30Days",
        "Yesterday",
        "Custom",
        "MonthToDate",
        "LastMonth",
        "QuarterToDate",
        "Lifetime",
      ])
      .describe("Date range for the report data"),
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
      .optional()
      .describe(
        "TTD report template ID. Find IDs via ttd_list_report_templates or the TTD UI. Required by the TTD API for report schedule creation."
      ),
    additionalConfig: z
      .record(z.unknown())
      .optional()
      .describe(
        "Additional TTD report config fields passed verbatim to the API. " +
          "Useful for: ReportStartDate / ReportEndDate (Custom range), delivery email settings, etc."
      ),
  })
  .describe("Parameters for creating a TTD report schedule");

export const CreateReportScheduleOutputSchema = z
  .object({
    reportScheduleId: z.string().describe("The created report schedule ID"),
    reportName: z.string(),
    scheduleType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Created report schedule");

type CreateReportScheduleInput = z.infer<typeof CreateReportScheduleInputSchema>;
type CreateReportScheduleOutput = z.infer<typeof CreateReportScheduleOutputSchema>;

export async function createReportScheduleLogic(
  input: CreateReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateReportScheduleOutput> {
  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const config = {
    ReportScheduleName: input.reportName,
    ReportScheduleType: input.scheduleType,
    ReportDateRange: input.dateRange,
    ReportFrequency: input.scheduleType,
    TimeZone: "UTC",
    ReportDateFormat: "Sortable",
    ReportNumericFormat: "US",
    ReportFileFormat: "CSV",
    ...(input.reportTemplateId && { ReportTemplateId: input.reportTemplateId }),
    ...(input.dimensions && { ReportDimensions: input.dimensions }),
    ...(input.metrics && { ReportMetrics: input.metrics }),
    ...(input.advertiserIds && { AdvertiserFilters: input.advertiserIds }),
    ...input.additionalConfig,
  };

  const result = await ttdReportingService.createReportSchedule(config, context);

  return {
    reportScheduleId: result.reportScheduleId,
    reportName: input.reportName,
    scheduleType: input.scheduleType,
    timestamp: new Date().toISOString(),
  };
}

export function createReportScheduleResponseFormatter(
  result: CreateReportScheduleOutput
): McpTextContent[] {
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
