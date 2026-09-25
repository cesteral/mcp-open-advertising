// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { ReportStatusSchema } from "@cesteral/shared";
import { mapTikTokReportTaskStatus } from "../../../services/tiktok/tiktok-reporting-service.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_check_report_status";
const TOOL_TITLE = "Check TikTok Report Status";
const TOOL_DESCRIPTION = `Check the status of a previously submitted TikTok report task.

Makes a single API call to check task status. Does not poll or wait.

**Canonical states:** \`pending\`, \`running\`, \`complete\`, \`failed\`.
TikTok raw statuses PENDING/RUNNING/DONE/FAILED are mapped; the raw string is returned as \`rawStatus\`.
Any other raw status is reported as \`failed\` with an explanation in \`errors\` — never as pending.
- TikTok's documented task-check response carries only \`status\` and \`message\`. If a \`downloadUrl\`
  is present, use \`tiktok_download_report\`; otherwise use \`tiktok_get_report\`, which returns rows
  synchronously.
- If still pending/running, call this tool again in ~10 seconds.`;

export const CheckReportStatusInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    taskId: z.string().min(1).describe("Report task ID from tiktok_submit_report"),
  })
  .describe("Parameters for checking TikTok report status");

export const CheckReportStatusOutputSchema = ReportStatusSchema.extend({
  taskId: z.string().describe("Report task ID"),
  rawStatus: z.string().describe("Raw TikTok status string (empty when TikTok returned none)"),
  message: z.string().optional().describe("TikTok's task message, when present"),
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
  const { tiktokReportingService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  const result = await tiktokReportingService.checkReportStatus(input.taskId, context);

  const canonical = mapTikTokReportTaskStatus({
    status: result.status,
    message: result.message,
  });

  return {
    ...canonical,
    ...(result.downloadUrl ? { downloadUrl: result.downloadUrl } : {}),
    taskId: result.taskId,
    rawStatus: result.status ?? "",
    ...(result.message ? { message: result.message } : {}),
    isComplete: canonical.state === "complete",
    timestamp: new Date().toISOString(),
  };
}

export function checkReportStatusResponseFormatter(
  result: CheckReportStatusOutput
): McpTextContent[] {
  if (result.isComplete && result.downloadUrl) {
    return [
      {
        type: "text" as const,
        text: `Report complete: ${result.taskId}\n\nDownload URL: ${result.downloadUrl}\n\nUse \`tiktok_download_report\` with this URL to fetch and parse the report data.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.isComplete) {
    return [
      {
        type: "text" as const,
        text: `Report complete: ${result.taskId}\n\nTikTok returned no download URL for this task. Use \`tiktok_get_report\` with the same parameters to fetch the rows synchronously.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.state === "failed") {
    return [
      {
        type: "text" as const,
        text: `Report failed: ${result.taskId} (raw status: ${result.rawStatus || "none"})\n\n${(result.errors ?? ["The report task failed. Check the report configuration and try again."]).join("\n")}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report in progress: ${result.taskId}\nState: ${result.state} (${result.rawStatus})\n\nCall \`tiktok_check_report_status\` again in ~10 seconds.\n\nTimestamp: ${result.timestamp}`,
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
        advertiserId: "1234567890",
        taskId: "task-abc123",
      },
    },
  ],
  logic: checkReportStatusLogic,
  responseFormatter: checkReportStatusResponseFormatter,
  // errors is never filled by the status mapper today; declared so a future failure reason is covered.
  untrustedContent: {
    structuredPaths: ["$.errors"],
    contentBlocks: [],
  },
};
