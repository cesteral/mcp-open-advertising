// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  appendComputedMetricsToRows,
  ComputedMetricsFlagSchema,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_download_report";
const TOOL_TITLE = "Download Meta Report Results";
const TOOL_DESCRIPTION = `Download results from a completed Meta Ads async insights report.

Only call this after \`meta_check_report_status\` returns \`isComplete: true\` (status "Job Succeeded").

Returns the insights data rows from the completed report run.`;

export const DownloadReportInputSchema = z
  .object({
    reportRunId: z
      .string()
      .min(1)
      .describe("Report run ID from meta_submit_report"),
    cursor: z
      .string()
      .optional()
      .describe("Meta paging cursor returned as nextCursor by a previous call. This tool pages via cursor; offset is not supported."),
  })
  .merge(ReportViewInputSchema.omit({ offset: true }))
  .merge(ComputedMetricsFlagSchema)
  .describe("Parameters for downloading Meta report results");

export const DownloadReportOutputSchema = z
  .object({
    reportRunId: z.string(),
    ...ReportViewOutputSchema.shape,
    fetchedAllRows: z.boolean().describe("Whether all available report rows were fetched. When false, totalRows is a lower bound and nextCursor should be used to continue."),
    nextCursor: z.string().optional().describe("Cursor for additional rows when maxRows capped the result set"),
    timestamp: z.string().datetime(),
  })
  .describe("Downloaded report results");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { metaInsightsService } = resolveSessionServices(sdkContext);

  const result = await metaInsightsService.getReportResults(
    input.reportRunId,
    { limit: getReportViewFetchLimit(input), after: input.cursor },
    context
  );
  const rawRows = result.data as Record<string, unknown>[];
  const rows = input.includeComputedMetrics
    ? appendComputedMetricsToRows(
        rawRows.map(stringifyRow),
        META_COMPUTED_METRIC_ALIASES,
      )
    : rawRows;
  const warnings = result.fetchedAllRows
    ? []
    : ["More rows are available. Call again with cursor set to nextCursor to continue."];

  return {
    reportRunId: input.reportRunId,
    ...createReportView({
      rows,
      totalRows: rows.length + (result.fetchedAllRows ? 0 : 1),
      input,
      warnings,
    }),
    fetchedAllRows: result.fetchedAllRows,
    nextCursor: result.nextCursor,
    timestamp: new Date().toISOString(),
  };
}

const META_COMPUTED_METRIC_ALIASES = {
  cost: ["spend", "Spend"],
  impressions: ["impressions", "Impressions"],
  clicks: ["clicks", "Clicks", "inline_link_clicks"],
  conversions: ["conversions", "actions", "Conversions"],
  conversionValue: ["conversion_values", "action_values", "purchase_roas"],
};

function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "string" ? v : v == null ? "" : String(v);
  }
  return out;
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  const summary = `Downloaded ${result.returnedRows} row(s) from report ${result.reportRunId}`;
  const truncationNote = result.fetchedAllRows
    ? ""
    : `\n\nResults were capped before the full report was exhausted.${result.nextCursor ? ` Continue from cursor: ${result.nextCursor}` : ""}`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${formatReportViewResponse(result, "Report data")}${truncationNote}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Download results from a completed report",
      input: {
        reportRunId: "6082575495383",
        mode: "summary",
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
