// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { reportCsvStore } from "../../../services/session-services.js";
import {
  ComputedMetricsFlagSchema,
  createServiceDownloadedReportView,
  extractReportIdFromUrl,
  formatReportViewResponse,
  ReportViewInputSchema,
  ReportViewOutputSchema,
  StoredReportBodyOutputSchema,
  spillBodyToGcs,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_download_report";
const TOOL_TITLE = "Download Microsoft Ads Report";
const TOOL_DESCRIPTION = `Download and parse a completed Microsoft Advertising report from its download URL.

Use after msads_check_report_status returns a downloadUrl. Returns a bounded summary or paged row slice.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z.string().url().describe("Report download URL from check-report-status"),
    storeRawCsv: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Persist the full CSV body in the in-process report-csv store and return " +
          "a `report-csv://{id}` resource URI. Entries expire after 30 minutes."
      ),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a Microsoft Ads report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
    ...StoredReportBodyOutputSchema.shape,
  })
  .describe("Downloaded report data");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

const MSADS_COMPUTED_METRIC_ALIASES = {
  cost: ["Spend", "spend", "Cost", "cost"],
  impressions: ["Impressions", "impressions"],
  clicks: ["Clicks", "clicks"],
  conversions: ["Conversions", "conversions", "AllConversions"],
  conversionValue: ["Revenue", "revenue", "AllRevenue"],
};

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  return createServiceDownloadedReportView({
    input,
    sessionId: sdkContext?.sessionId,
    reportCsvStore,
    spillBodyToGcs,
    spillServer: "microsoft",
    reportId: extractReportIdFromUrl(input.downloadUrl),
    computedMetricAliases: MSADS_COMPUTED_METRIC_ALIASES,
    download: ({ fetchLimit, includeRawCsv }) =>
      msadsReportingService.downloadReport(input.downloadUrl, fetchLimit, context, {
        includeRawCsv,
      }),
  });
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: formatReportViewResponse(result, "Downloaded report"),
    },
  ];
}

export const downloadReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DownloadReportInputSchema,
  outputSchema: DownloadReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Download a report",
      input: {
        downloadUrl: "https://download.api.bingads.microsoft.com/reports/...",
        mode: "rows",
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
