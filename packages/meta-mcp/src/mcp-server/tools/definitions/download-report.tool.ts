// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
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
    maxRows: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .default(100)
      .describe("Maximum rows to return (1-500, default 100)"),
  })
  .describe("Parameters for downloading Meta report results");

export const DownloadReportOutputSchema = z
  .object({
    reportRunId: z.string(),
    results: z.array(z.record(z.any())).describe("Insights data rows"),
    totalResults: z.number(),
    fetchedAllRows: z.boolean().describe("Whether all available report rows were fetched"),
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
    { limit: input.maxRows },
    context
  );

  return {
    reportRunId: input.reportRunId,
    results: result.data as Record<string, unknown>[],
    totalResults: (result.data as unknown[]).length,
    fetchedAllRows: result.fetchedAllRows,
    nextCursor: result.nextCursor,
    timestamp: new Date().toISOString(),
  };
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  const summary = `Downloaded ${result.totalResults} row(s) from report ${result.reportRunId}`;
  const truncationNote = result.fetchedAllRows
    ? ""
    : `\n\nResults were capped before the full report was exhausted.${result.nextCursor ? ` Continue from cursor: ${result.nextCursor}` : ""}`;
  const data = result.totalResults > 0
    ? `\n\n${JSON.stringify(result.results, null, 2)}`
    : "\n\nNo data available in the report";

  return [
    {
      type: "text" as const,
      text: `${summary}${data}${truncationNote}\n\nTimestamp: ${result.timestamp}`,
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
        maxRows: 100,
      },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};
