// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_report";
const TOOL_TITLE = "Get TTD Report";
const TOOL_DESCRIPTION = `Generate and retrieve a report from The Trade Desk.

Uses the TTD MyReports API to create a report schedule, poll for execution, and return results. This is an async operation that may take several seconds to complete.

Provide report configuration including dimensions, metrics, date range, and optional filters.`;

export const GetReportInputSchema = z
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
        "Report file format. Must match the template's format. Use ExcelPivot for Excel-shaped templates. CSV-only output is parseable by ttd_download_report."
      ),
    scheduleStartDate: z
      .string()
      .optional()
      .describe(
        "ISO date or datetime when the schedule should first run. Defaults to today UTC at 00:00."
      ),
    advertiserIds: z.array(z.string()).optional().describe("Filter by advertiser IDs"),
    dimensions: z
      .array(z.string())
      .optional()
      .describe("(legacy/ignored when ReportTemplateId is set)"),
    metrics: z
      .array(z.string())
      .optional()
      .describe("(legacy/ignored when ReportTemplateId is set)"),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields (merged last)"),
  })
  .describe("Parameters for generating a TTD report");

export const GetReportOutputSchema = z
  .object({
    reportScheduleId: z.string().describe("Report schedule ID"),
    execution: z.record(z.any()).describe("Report execution details"),
    downloadUrl: z.string().optional().describe("URL to download report results"),
    timestamp: z.string().datetime(),
  })
  .describe("Report generation result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
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

  const result = (await ttdReportingService.runReport(reportConfig, context)) as Record<
    string,
    unknown
  >;

  return {
    reportScheduleId: result.reportScheduleId as string,
    execution: (result.execution as Record<string, any>) || {},
    downloadUrl: result.downloadUrl as string | undefined,
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  const downloadInfo = result.downloadUrl
    ? `\n\nDownload URL: ${result.downloadUrl}`
    : "\n\nNo download URL available yet.";

  return [
    {
      type: "text" as const,
      text: `Report generated: ${result.reportScheduleId}${downloadInfo}\n\nExecution details:\n${JSON.stringify(result.execution, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportInputSchema,
  outputSchema: GetReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Campaign performance report for last 7 days (CSV template)",
      input: {
        reportName: "Campaign Performance - Last 7 Days",
        dateRange: "Last7Days",
        reportTemplateId: 16353,
        fileFormat: "ExcelPivot",
        advertiserIds: ["adv123abc"],
      },
    },
    {
      label: "Yesterday report with explicit CSV template",
      input: {
        reportName: "Daily Summary",
        dateRange: "Yesterday",
        reportTemplateId: 12345,
        fileFormat: "CSV",
        advertiserIds: ["adv123abc"],
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};
