// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { fromPinterestStatus, ReportStatusSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_check_report_status";
const TOOL_TITLE = "Check Pinterest Report Status";
const TOOL_DESCRIPTION = `Check the status of a previously submitted Pinterest report task.

Makes a single API call to check task status. Does not poll or wait.

**Canonical states:** \`pending\`, \`running\`, \`complete\`, \`failed\`.
Pinterest raw statuses (IN_PROGRESS/FINISHED/FAILED/EXPIRED/DOES_NOT_EXIST) are mapped; EXPIRED and DOES_NOT_EXIST surface as \`failed\` since the artifact is no longer retrievable. The raw string is returned as \`rawStatus\`.
- If state is \`complete\` with a \`downloadUrl\`, use \`pinterest_download_report\` to fetch results.
- If not finished, call this tool again in ~10 seconds.`;

export const CheckReportStatusInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Ad Account ID"),
    taskId: z
      .string()
      .min(1)
      .describe("Report token/task ID from pinterest_submit_report"),
  })
  .describe("Parameters for checking Pinterest report status");

export const CheckReportStatusOutputSchema = ReportStatusSchema.extend({
  taskId: z.string().describe("Report token/task ID"),
  rawStatus: z.string().describe("Raw Pinterest status (IN_PROGRESS/FINISHED/FAILED/EXPIRED/DOES_NOT_EXIST)"),
  isComplete: z.boolean().describe("Whether the canonical state is 'complete'"),
  timestamp: z.string().datetime(),
}).describe("Report status check result");

type CheckReportStatusInput = z.infer<typeof CheckReportStatusInputSchema>;
type CheckReportStatusOutput = z.infer<typeof CheckReportStatusOutputSchema>;

export async function checkReportStatusLogic(
  input: CheckReportStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CheckReportStatusOutput> {
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  const result = await pinterestReportingService.checkReportStatus(
    input.taskId,
    context
  );

  const canonical = fromPinterestStatus({
    status: result.status,
    downloadUrl: result.downloadUrl,
  });

  return {
    ...canonical,
    taskId: result.taskId,
    rawStatus: result.status,
    isComplete: canonical.state === "complete",
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(result: CheckReportStatusOutput): McpTextContent[] {
  if (result.isComplete && result.downloadUrl) {
    return [
      {
        type: "text" as const,
        text: `Report complete: ${result.taskId}\n\nDownload URL: ${result.downloadUrl}\n\nUse \`pinterest_download_report\` with this URL to fetch and parse the report data.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.state === "failed") {
    return [
      {
        type: "text" as const,
        text: `Report failed: ${result.taskId}\nState: ${result.state} (${result.rawStatus})\n\nThe report task failed. Check the report configuration and try again.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report in progress: ${result.taskId}\nState: ${result.state} (${result.rawStatus})\n\nCall \`pinterest_check_report_status\` again in ~10 seconds.\n\nTimestamp: ${result.timestamp}`,
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
        taskId: "token-abc123",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
};