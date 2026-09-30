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
const TOOL_DESCRIPTION = `Check the status of an existing TikTok async report task (status only — no rows).

Makes a single API call to TikTok's report task-check endpoint. Does not poll or wait.

**Canonical states:** \`pending\`, \`running\`, \`complete\`, \`failed\`.
TikTok raw statuses PENDING/RUNNING/DONE/FAILED are mapped; the raw string is returned as \`rawStatus\`.
Any other raw status is reported as \`failed\` with an explanation in \`errors\` — never as pending.

TikTok documents only \`status\` and \`message\` on this response and no report-task download
endpoint, so a finished task's rows cannot be fetched and this tool never returns a \`downloadUrl\`.
New async tasks cannot be submitted (\`tiktok_submit_report\` refuses). To get report rows, use
\`tiktok_get_report\`, which runs the report synchronously.`;

export const CheckReportStatusInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    taskId: z.string().min(1).describe("Report task ID (from report/task/create/)"),
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
  if (result.isComplete) {
    return [
      {
        type: "text" as const,
        text: `Report task complete: ${result.taskId}\n\nTikTok documents no way to download an async report task's rows. Use \`tiktok_get_report\` with the same parameters to fetch the rows synchronously.\n\nTimestamp: ${result.timestamp}`,
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
  // `message` is TikTok's own task text. mapTikTokReportTaskStatus copies it
  // into `errors` for a FAILED or unrecognized status, and the failed-state
  // formatter prints `errors` into block 0.
  untrustedContent: {
    structuredPaths: ["$.errors", "$.message"],
    contentBlocks: [0],
  },
};
