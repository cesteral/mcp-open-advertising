// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_download_report";
const TOOL_TITLE = "Download Microsoft Ads Report";
const TOOL_DESCRIPTION = `Download and parse a completed Microsoft Advertising report from its download URL.

Use after msads_check_report_status returns a downloadUrl.`;

export const DownloadReportInputSchema = z
  .object({
    downloadUrl: z
      .string()
      .url()
      .describe("Report download URL from check-report-status"),
    maxRows: z
      .number()
      .optional()
      .describe("Maximum rows to return"),
  })
  .describe("Parameters for downloading a Microsoft Ads report");

export const DownloadReportOutputSchema = z
  .object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    totalRows: z.number(),
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
    input.maxRows,
    context
  );

  return {
    headers: result.headers,
    rows: result.rows,
    totalRows: result.rows.length,
    timestamp: new Date().toISOString(),
  };
}

export function downloadReportResponseFormatter(result: DownloadReportOutput): McpTextContent[] {
  const preview = result.rows.slice(0, 10);
  const previewText = preview.length > 0
    ? `\n\nHeaders: ${result.headers.join(", ")}\n\nData (${result.totalRows} rows${result.totalRows > 10 ? ", showing first 10" : ""}):\n${JSON.stringify(preview, null, 2)}`
    : "\n\nNo data rows in report";

  return [
    {
      type: "text" as const,
      text: `Downloaded report with ${result.totalRows} rows${previewText}\n\nTimestamp: ${result.timestamp}`,
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
      input: { downloadUrl: "https://download.api.bingads.microsoft.com/reports/..." },
    },
  ],
  logic: downloadReportLogic,
  responseFormatter: downloadReportResponseFormatter,
};