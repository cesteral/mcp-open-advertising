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
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

const TOOL_NAME = "cm360_download_report";
const TOOL_TITLE = "Download CM360 Report";
const TOOL_DESCRIPTION = `Download and parse a CM360 report from its download URL.

Use the downloadUrl from cm360_get_report or cm360_check_report_status. Returns a bounded summary or paged row slice.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL (from cm360_get_report or cm360_check_report_status)"),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading a CM360 report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Report download result");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const response = await cm360ReportingService.downloadReportFile(
    input.downloadUrl,
    30_000,
    context
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const detail = errorBody ? ` — ${errorBody.substring(0, 500)}` : "";
    throw new Error(
      `Failed to download report: ${response.status} ${response.statusText}${detail}`
    );
  }

  const format = inferReportFormat(input.downloadUrl, response);
  if (format !== "CSV") {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unsupported CM360 report format: ${format}. cm360_download_report only supports CSV downloads.`
    );
  }

  const csvText = await response.text();
  const { headers, rows } = parseCSV(csvText);

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
    ? appendComputedMetricsToRows(rows, CM360_COMPUTED_METRIC_ALIASES)
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
      warnings: computedWarning ? [`computed metrics: ${computedWarning}`] : undefined,
    }),
    timestamp: new Date().toISOString(),
  };
}

const CM360_COMPUTED_METRIC_ALIASES = {
  cost: ["mediaCost", "cost", "dfa:mediaCost", "Media Cost", "MediaCost"],
  impressions: ["impressions", "dfa:impressions", "Impressions"],
  clicks: ["clicks", "dfa:clicks", "Clicks"],
  conversions: ["totalConversions", "conversions", "dfa:totalConversions", "Total Conversions"],
  conversionValue: ["floodlightRevenue", "revenue", "totalRevenue", "dfa:floodlightRevenue"],
};

function inferReportFormat(downloadUrl: string, response: Response): "CSV" | "EXCEL" | "UNKNOWN" {
  const contentType = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("spreadsheetml") || contentType.includes("application/vnd.ms-excel")) {
    return "EXCEL";
  }
  if (
    contentType.includes("text/csv") ||
    contentType.includes("application/csv") ||
    contentType.includes("text/plain")
  ) {
    return "CSV";
  }

  const normalizedUrl = downloadUrl.toLowerCase();
  if (normalizedUrl.includes(".csv") || normalizedUrl.includes("format=csv")) {
    return "CSV";
  }
  if (
    normalizedUrl.includes(".xls") ||
    normalizedUrl.includes(".xlsx") ||
    normalizedUrl.includes("format=excel")
  ) {
    return "EXCEL";
  }

  return "UNKNOWN";
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  if (result.returnedRows === 0) {
    return [
      {
        type: "text" as const,
        text: `Report is empty — no data rows.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: formatReportViewResponse(result, "Report data"),
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Download a report",
      input: {
        downloadUrl:
          "https://dfareporting.googleapis.com/dfareporting/v5/userprofiles/123456/reports/789012/files/345678?alt=media",
        mode: "rows",
        maxRows: 50,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
