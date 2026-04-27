// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_submit_report";
const TOOL_TITLE = "Submit TTD Report";
const TOOL_DESCRIPTION = `Submit a report to The Trade Desk without waiting for completion.

Returns a \`reportScheduleId\` immediately. Use \`ttd_check_report_status\` to poll for completion, then \`ttd_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`ttd_submit_report\` → get \`reportScheduleId\`
2. \`ttd_check_report_status\` (repeat every 5-10s) → wait for "Complete"
3. \`ttd_download_report\` with the \`downloadUrl\` → get a bounded summary or paged row slice

Use \`ttd_get_report\` instead for a blocking convenience shortcut.`;

export const SubmitReportInputSchema = z
  .object({
    reportName: z.string().describe("Name for the report"),
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
    advertiserIds: z.array(z.string()).optional().describe("Filter by advertiser IDs"),
    reportTemplateId: z
      .number()
      .optional()
      .describe(
        "TTD report template ID. Find IDs via ttd_list_report_templates or the TTD UI. Required by the TTD API for report schedule creation."
      ),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields"),
  })
  .describe("Parameters for submitting a TTD report");

export const SubmitReportOutputSchema = z
  .object({
    reportScheduleId: z.string().describe("Report schedule ID for status polling"),
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
  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const reportConfig = {
    ReportScheduleName: input.reportName,
    ReportScheduleType: "Once" as const,
    ReportDateRange: input.dateRange,
    ReportFrequency: "Once" as const,
    TimeZone: "UTC",
    ReportDateFormat: "Sortable",
    ReportNumericFormat: "US",
    ReportFileFormat: "CSV",
    IncludeHeaders: true,
    ...(input.reportTemplateId && { ReportTemplateId: input.reportTemplateId }),
    ...(input.dimensions && { ReportDimensions: input.dimensions }),
    ...(input.metrics && { ReportMetrics: input.metrics }),
    ...(input.advertiserIds && { AdvertiserFilters: input.advertiserIds }),
    ...input.additionalConfig,
  };

  const result = await ttdReportingService.createReportSchedule(reportConfig, context);

  return {
    reportScheduleId: result.reportScheduleId,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.reportScheduleId}\n\nUse \`ttd_check_report_status\` with this reportScheduleId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit campaign performance report",
      input: {
        reportName: "Campaign Performance - Last 7 Days",
        dateRange: "Last7Days",
        dimensions: ["AdvertiserId", "CampaignId", "CampaignName"],
        metrics: ["Impressions", "Clicks", "TotalCost", "CTR", "CPM"],
        advertiserIds: ["adv123abc"],
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
