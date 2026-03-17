// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_submit_report";
const TOOL_TITLE = "Submit Microsoft Ads Report";
const TOOL_DESCRIPTION = `Submit a Microsoft Advertising report request without waiting for completion (non-blocking).

Returns a ReportRequestId that can be used with msads_check_report_status to poll for results.`;

export const SubmitReportInputSchema = z
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
      .describe("Report columns to include"),
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
  })
  .describe("Parameters for submitting a Microsoft Ads report");

export const SubmitReportOutputSchema = z
  .object({
    reportRequestId: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Report submission result");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  const reportRequestId = await msadsReportingService.submitReport(
    {
      reportType: input.reportType,
      accountId: input.accountId,
      columns: input.columns,
      dateRange: { startDate: input.startDate, endDate: input.endDate },
      aggregation: input.aggregation,
    },
    context
  );

  return {
    reportRequestId,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted successfully.\n\nReportRequestId: ${result.reportRequestId}\n\nUse msads_check_report_status to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const submitReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SubmitReportInputSchema,
  outputSchema: SubmitReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Submit keyword performance report",
      input: {
        reportType: "KeywordPerformanceReportRequest",
        accountId: "123456789",
        columns: ["Keyword", "Impressions", "Clicks", "AverageCpc"],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};