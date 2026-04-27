// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  arrayRowsToRecords,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  resolveDatePreset,
  DATE_PRESET_VALUES,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_get_report_breakdowns";
const TOOL_TITLE = "Get Microsoft Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit a Microsoft Advertising report with additional breakdown columns and poll until complete (blocking).

Like \`msads_get_report\` but adds \`breakdownColumns\` (dimension/segment columns) to segment data
by device, network, time-of-day, match type, and more.

**Common breakdown columns:** DeviceOS, Network, TopVsOther, MatchType, AccountName, TimePeriod

Results will include one row per combination of entity + breakdown dimensions.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    reportType: z.string().describe("Report type (e.g., CampaignPerformanceReportRequest)"),
    accountId: z.string().describe("Microsoft Ads Account ID"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Base metric/attribute columns (e.g., CampaignName, Impressions, Clicks, Spend)"),
    breakdownColumns: z
      .array(z.string())
      .min(1)
      .describe(
        "Additional dimension columns to segment by (e.g., ['DeviceOS', 'Network']). Merged with base columns."
      ),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startDate+endDate (not both)"),
    startDate: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD, required if datePreset not provided)"),
    endDate: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD, required if datePreset not provided)"),
    aggregation: z
      .string()
      .optional()
      .describe("Time aggregation (Daily, Weekly, Monthly, Hourly). Default: Daily"),
  })
  .merge(ReportViewInputSchema.omit({ columns: true }))
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for running a Microsoft Ads report with breakdown columns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    reportRequestId: z.string(),
    ...ReportViewOutputSchema.shape,
    appliedColumns: z.array(z.string()).describe("All columns used (base + breakdown)"),
    timestamp: z.string().datetime(),
  })
  .describe("Report with breakdowns result");

type GetReportBreakdownsInput = z.infer<typeof GetReportBreakdownsInputSchema>;
type GetReportBreakdownsOutput = z.infer<typeof GetReportBreakdownsOutputSchema>;

export async function getReportBreakdownsLogic(
  input: GetReportBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportBreakdownsOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  // Deduplicate: merge base columns + breakdown columns preserving order
  const seenColumns = new Set(input.columns);
  const uniqueBreakdownColumns = input.breakdownColumns.filter((c) => {
    if (seenColumns.has(c)) return false;
    seenColumns.add(c);
    return true;
  });
  const allColumns = [...input.columns, ...uniqueBreakdownColumns];

  const result = await msadsReportingService.getReport(
    {
      reportType: input.reportType,
      accountId: input.accountId,
      columns: allColumns,
      dateRange: { startDate: resolvedStartDate!, endDate: resolvedEndDate! },
      aggregation: input.aggregation,
    },
    getReportViewFetchLimit(input),
    context
  );

  return {
    reportRequestId: result.reportRequestId,
    ...createReportView({
      headers: result.headers,
      rows: arrayRowsToRecords(result.headers, result.rows),
      totalRows: result.totalRows,
      input: { ...input, columns: allColumns },
    }),
    appliedColumns: allColumns,
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(
  result: GetReportBreakdownsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report ${result.reportRequestId} completed\nApplied columns: ${result.appliedColumns.join(", ")}\n\n${formatReportViewResponse(result, "Report data")}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getReportBreakdownsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportBreakdownsInputSchema,
  outputSchema: GetReportBreakdownsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign performance broken down by device",
      input: {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123456789",
        columns: ["CampaignName", "Impressions", "Clicks", "Spend"],
        breakdownColumns: ["DeviceOS", "Network"],
        datePreset: "LAST_30_DAYS",
        mode: "summary",
      },
    },
    {
      label: "Keyword performance broken down by match type and network",
      input: {
        reportType: "KeywordPerformanceReportRequest",
        accountId: "123456789",
        columns: ["Keyword", "Impressions", "Clicks", "Spend", "AverageCpc"],
        breakdownColumns: ["MatchType", "Network", "TopVsOther"],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        aggregation: "Daily",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};
