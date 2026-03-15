// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_get_report";
const TOOL_TITLE = "Get TTD Report";
const TOOL_DESCRIPTION = `Generate and retrieve a report from The Trade Desk.

Uses the TTD MyReports API to create a report schedule, poll for execution, and return results. This is an async operation that may take several seconds to complete.

Provide report configuration including dimensions, metrics, date range, and optional filters.`;

export const GetReportInputSchema = z
  .object({
    reportName: z
      .string()
      .describe("Name for the report"),
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
      .describe("Date range for the report"),
    dimensions: z
      .array(z.string())
      .optional()
      .describe("Report dimensions (e.g., ['AdvertiserId', 'CampaignId'])"),
    metrics: z
      .array(z.string())
      .optional()
      .describe("Report metrics (e.g., ['Impressions', 'Clicks', 'TotalCost'])"),
    advertiserIds: z
      .array(z.string())
      .optional()
      .describe("Filter by advertiser IDs"),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields"),
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

  const reportConfig = {
    ReportName: input.reportName,
    ReportScheduleType: "Once" as const,
    ReportDateRange: input.dateRange,
    ...(input.dimensions && { ReportDimensions: input.dimensions }),
    ...(input.metrics && { ReportMetrics: input.metrics }),
    ...(input.advertiserIds && { AdvertiserFilters: input.advertiserIds }),
    ...input.additionalConfig,
  };

  const result = (await ttdReportingService.runReport(
    reportConfig,
    context
  )) as Record<string, unknown>;

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
      label: "Campaign performance report for last 7 days",
      input: {
        reportName: "Campaign Performance - Last 7 Days",
        dateRange: "Last7Days",
        dimensions: ["AdvertiserId", "CampaignId", "CampaignName"],
        metrics: ["Impressions", "Clicks", "TotalCost", "CTR", "CPM"],
        advertiserIds: ["adv123abc"],
      },
    },
    {
      label: "Conversion report for last 30 days",
      input: {
        reportName: "Conversion Report - Last 30 Days",
        dateRange: "Last30Days",
        dimensions: ["AdvertiserId", "CampaignId", "AdGroupId", "ConversionTrackerName"],
        metrics: ["Impressions", "Clicks", "TotalConversions", "TotalCost", "CPA"],
        advertiserIds: ["adv123abc", "adv456def"],
      },
    },
    {
      label: "Month-to-date ad group pacing report",
      input: {
        reportName: "Ad Group Pacing MTD",
        dateRange: "MonthToDate",
        dimensions: ["CampaignId", "AdGroupId", "AdGroupName"],
        metrics: ["Impressions", "TotalCost", "AdvertiserCost"],
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};