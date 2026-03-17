// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_check_report_status";
const TOOL_TITLE = "Check CM360 Report Status";
const TOOL_DESCRIPTION = `Check the status of a CM360 report file. Single status check — no polling.

Status values: PROCESSING, REPORT_AVAILABLE, FAILED, CANCELLED.

When status is REPORT_AVAILABLE, a downloadUrl is provided. Use cm360_download_report to fetch the results.`;

export const CheckReportStatusInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    reportId: z
      .string()
      .min(1)
      .describe("Report ID from cm360_submit_report"),
    fileId: z
      .string()
      .min(1)
      .describe("File ID from cm360_submit_report"),
  })
  .describe("Parameters for checking CM360 report status");

export const CheckReportStatusOutputSchema = z
  .object({
    reportId: z.string().describe("Report ID"),
    fileId: z.string().describe("File ID"),
    status: z.string().describe("Report status (PROCESSING, REPORT_AVAILABLE, FAILED, CANCELLED)"),
    file: z.record(z.any()).describe("File details"),
    downloadUrl: z.string().optional().describe("Download URL when REPORT_AVAILABLE"),
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
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const result = await cm360ReportingService.checkReportFile(
    input.profileId,
    input.reportId,
    input.fileId,
    context
  );

  return {
    reportId: result.reportId,
    fileId: result.fileId,
    status: result.status,
    file: result.file,
    downloadUrl: result.downloadUrl,
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  const downloadInfo = result.downloadUrl
    ? `\n\nDownload URL: ${result.downloadUrl}\nUse cm360_download_report to fetch results.`
    : "";

  return [
    {
      type: "text" as const,
      text: `Report ${result.reportId} status: ${result.status}${downloadInfo}\n\nFile details:\n${JSON.stringify(result.file, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Check report status",
      input: {
        profileId: "123456",
        reportId: "789012",
        fileId: "345678",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};