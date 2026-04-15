// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  arrayRowsToRecords,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_download_report";
const TOOL_TITLE = "Download Microsoft Ads Report";
const TOOL_DESCRIPTION = `Download and parse a completed Microsoft Advertising report from its download URL.

Use after msads_check_report_status returns a downloadUrl. Returns a bounded summary or paged row slice.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from check-report-status"),
  })
  .merge(ReportViewInputSchema)
  .describe("Parameters for downloading a Microsoft Ads report");

export const DownloadReportOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Downloaded report data");

type DownloadReportInput = z.infer<typeof DownloadReportInputSchema>;
type DownloadReportOutput = z.infer<typeof DownloadReportOutputSchema>;

export async function downloadReportLogic(
  input: DownloadReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DownloadReportOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  const result = await msadsReportingService.downloadReport(
    input.downloadUrl,
    getReportViewFetchLimit(input),
    context
  );

  return {
    ...createReportView({
      headers: result.headers,
      rows: arrayRowsToRecords(result.headers, result.rows),
      totalRows: result.totalRows,
      input,
    }),
    timestamp: new Date().toISOString(),
  };
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
