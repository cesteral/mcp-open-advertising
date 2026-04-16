// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  appendComputedMetricsToRows,
  ComputedMetricsFlagSchema,
  createReportView,
  formatReportViewResponse,
  parseCSV,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_download_report";
const TOOL_TITLE = "Download SA360 Report";
const TOOL_DESCRIPTION = `Download a completed SA360 async report file.

Use the download URL from \`sa360_check_report_status\` (when isReportReady is true). Returns a bounded summary or paged row slice.

**Workflow:** sa360_submit_report → sa360_check_report_status → **sa360_download_report**`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .min(1)
      .describe("Download URL from sa360_check_report_status file list"),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a report file");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Parsed report data");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { reportingService } = resolveSessionServices(sdkContext);

  const csvData = await reportingService.downloadReport(input.downloadUrl, context);
  const { headers, rows } = parseCSV(csvData);

  if (headers.length === 0 && rows.length === 0) {
    return {
      headers: [],
      selectedColumns: [],
      totalRows: 0,
      returnedRows: 0,
      truncated: false,
      nextOffset: null,
      mode: input.mode ?? "summary",
      previewRows: input.mode === "rows" ? undefined : [],
      rows: input.mode === "rows" ? [] : undefined,
      warnings: [],
      timestamp: new Date().toISOString(),
    };
  }

  const augmented = input.includeComputedMetrics
    ? appendComputedMetricsToRows(rows, SA360_COMPUTED_METRIC_ALIASES)
    : rows;
  const computedWarning = input.includeComputedMetrics
    ? augmented[0]?._computedMetricsWarnings
    : undefined;
  const augmentedHeaders = input.includeComputedMetrics
    ? [...headers, "cpa", "roas", "cpm", "ctr", "cpc"]
    : headers;

  return {
    ...createReportView({
      headers: augmentedHeaders,
      rows: augmented,
      totalRows: rows.length,
      input,
      warnings: computedWarning
        ? [`computed metrics: ${computedWarning}`]
        : undefined,
    }),
    timestamp: new Date().toISOString(),
  };
}

const SA360_COMPUTED_METRIC_ALIASES = {
  cost: ["cost", "costMicros", "totalCost"],
  impressions: ["impressions", "impr"],
  clicks: ["clicks"],
  conversions: ["conversions", "allConversions"],
  conversionValue: ["conversionsValue", "allConversionsValue", "totalConversionValue"],
};

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: formatReportViewResponse(result, "Report downloaded"),
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
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Download a completed report",
      input: {
        downloadUrl: "https://www.googleapis.com/doubleclicksearch/v2/reports/12345/files/0",
        mode: "rows",
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
