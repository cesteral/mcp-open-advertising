// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_check_report_status";
const TOOL_TITLE = "Check Snapchat Report Status";
const TOOL_DESCRIPTION = `Check the status of a previously submitted Snapchat report task.

Makes a single API call to check task status. Does not poll or wait.

**Statuses:** PENDING, RUNNING, COMPLETE, FAILED
- If COMPLETE with a \`downloadUrl\`, use \`snapchat_download_report\` to fetch results.
- If not done, call this tool again in ~10 seconds.`;

export const CheckReportStatusInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Ad Account ID"),
    taskId: z
      .string()
      .min(1)
      .describe("Report run ID from snapchat_submit_report"),
  })
  .describe("Parameters for checking Snapchat report status");

export const CheckReportStatusOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    status: z.string().describe("Current task status"),
    isComplete: z.boolean().describe("Whether the report is complete (COMPLETE)"),
    downloadUrl: z.string().optional().describe("Download URL when COMPLETE"),
    timestamp: z.string().datetime(),
  })
  .describe("Report status check result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  const result = await snapchatReportingService.checkReportStatus(
    input.taskId,
    context
  );

  return {
    taskId: result.taskId,
    status: result.status,
    isComplete: result.status === "COMPLETE",
    downloadUrl: result.downloadUrl,
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  if (result.isComplete && result.downloadUrl) {
    return [
      {
        type: "text" as const,
      text: `Report complete: ${result.taskId}\n\nDownload URL: ${result.downloadUrl}\n\nUse \`snapchat_download_report\` with this URL to fetch and parse the report data.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.status === "FAILED") {
    return [
      {
        type: "text" as const,
        text: `Report failed: ${result.taskId}\n\nThe report task failed. Check the report configuration and try again.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report in progress: ${result.taskId}\nStatus: ${result.status}\n\nCall \`snapchat_check_report_status\` again in ~10 seconds.\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Check report task status",
      input: {
        adAccountId: "1234567890",
        taskId: "rpt-abc123",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};
