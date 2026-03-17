// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
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
    startDate: z
      .string()
      .describe("Start date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .describe("End date (YYYY-MM-DD)"),
    aggregation: z
      .string()
      .optional()
      .describe("Time aggregation (Daily, Weekly, Monthly, Hourly). Default: Daily"),
    maxRows: z
      .number()
      .optional()
      .describe("Maximum rows to return from downloaded report"),
  })
  .describe("Parameters for running a Microsoft Ads report");

export const GetReportOutputSchema = z
  .object({
    reportRequestId: z.string(),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    totalRows: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Report result with parsed data");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  const result = await msadsReportingService.getReport(
    {
      reportType: input.reportType,
      accountId: input.accountId,
      columns: input.columns,
      dateRange: { startDate: input.startDate, endDate: input.endDate },
      aggregation: input.aggregation,
    },
    input.maxRows,
    context
  );

  return {
    reportRequestId: result.reportRequestId,
    headers: result.headers,
    rows: result.rows,
    totalRows: result.totalRows,
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  const preview = result.rows.slice(0, 10);
  const previewText = preview.length > 0
    ? `\n\nHeaders: ${result.headers.join(", ")}\n\nData (${result.rows.length}${result.rows.length < result.totalRows ? ` of ${result.totalRows}` : ""} rows${result.rows.length > 10 ? ", showing first 10" : ""}):\n${JSON.stringify(preview, null, 2)}`
    : "\n\nNo data rows returned";

  return [
    {
      type: "text" as const,
      text: `Report ${result.reportRequestId} completed with ${result.rows.length}${result.rows.length < result.totalRows ? ` of ${result.totalRows}` : ""} rows${previewText}\n\nTimestamp: ${result.timestamp}`,
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
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};