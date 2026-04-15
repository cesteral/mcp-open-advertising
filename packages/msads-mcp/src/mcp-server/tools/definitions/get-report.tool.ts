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

const TOOL_NAME = "msads_get_report";
const TOOL_TITLE = "Get Microsoft Ads Report";
const TOOL_DESCRIPTION = `Submit a Microsoft Advertising report request, poll until complete, and download results (blocking).

Report types: CampaignPerformanceReportRequest, AdGroupPerformanceReportRequest, AdPerformanceReportRequest, KeywordPerformanceReportRequest, SearchQueryPerformanceReportRequest, etc.

This is a blocking operation — it will wait for the report to complete before returning.`;

export const GetReportInputSchema = z
  .object({
    reportType: z
      .string()
      .describe("Report type (e.g., CampaignPerformanceReportRequest)"),
    accountId: z
      .string()
      .describe("Microsoft Ads Account ID"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Report columns to include (e.g., CampaignName, Impressions, Clicks)"),
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
    (data) => data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for running a Microsoft Ads report");

export const GetReportOutputSchema = z
  .object({
    reportRequestId: z.string(),
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Report result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await msadsReportingService.getReport(
    {
      reportType: input.reportType,
      accountId: input.accountId,
      columns: input.columns,
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
      input,
    }),
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report ${result.reportRequestId} completed\n\n${formatReportViewResponse(result, "Report data")}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign performance report",
      input: {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123456789",
        columns: ["CampaignName", "Impressions", "Clicks", "Spend"],
        datePreset: "LAST_30_DAYS",
        mode: "summary",
      },
    },
    {
      label: "Campaign performance with explicit dates",
      input: {
        reportType: "CampaignPerformanceReportRequest",
        accountId: "123456789",
        columns: ["CampaignName", "Impressions", "Clicks", "Spend"],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};
