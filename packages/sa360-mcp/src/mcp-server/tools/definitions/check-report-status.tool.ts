// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_check_report_status";
const TOOL_TITLE = "Check SA360 Report Status";
const TOOL_DESCRIPTION = `Check the status of a previously submitted SA360 async report.

Poll this endpoint until \`isReportReady\` is true, then use the file URLs with \`sa360_download_report\` to retrieve results.

**Workflow:** sa360_submit_report → **sa360_check_report_status** (poll) → sa360_download_report`;

export const CheckReportStatusInputSchema = z
  .object({
    reportId: z
      .string()
      .min(1)
      .describe("Report ID returned by sa360_submit_report"),
  })
  .describe("Parameters for checking report status");

export const CheckReportStatusOutputSchema = z
  .object({
    reportId: z.string().describe("Report ID"),
    isReportReady: z.boolean().describe("Whether the report is ready for download"),
    rowCount: z.number().optional().describe("Number of rows in the report (when ready)"),
    files: z
      .array(
        z.object({
          url: z.string().describe("Download URL for this report file"),
          byteCount: z.string().optional().describe("File size in bytes"),
        })
      )
      .optional()
      .describe("Download file URLs (when ready)"),
    timestamp: z.string().datetime(),
  })
  .describe("Report status result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { reportingService } = resolveSessionServices(sdkContext);

  const status = await reportingService.getReportStatus(input.reportId, context);

  return {
    reportId: status.id,
    isReportReady: status.isReportReady,
    rowCount: status.rowCount,
    files: status.files,
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  if (result.isReportReady) {
    const fileList = result.files?.map((f, i) => `  ${i + 1}. ${f.url}`).join("\n") || "  (no files)";
    return [
      {
        type: "text" as const,
        text: `Report ${result.reportId} is READY.\nRows: ${result.rowCount ?? "unknown"}\n\nDownload files:\n${fileList}\n\nUse sa360_download_report with any file URL above.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report ${result.reportId} is still processing. Poll again shortly.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const checkReportStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CheckReportStatusInputSchema,
  outputSchema: CheckReportStatusOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Check if a report is ready",
      input: {
        reportId: "abc123def456",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};
