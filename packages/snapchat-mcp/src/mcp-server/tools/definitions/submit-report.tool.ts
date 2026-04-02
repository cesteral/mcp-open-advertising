// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_submit_report";
const TOOL_TITLE = "Submit Snapchat Report";
const TOOL_DESCRIPTION = `Submit a Snapchat Ads report task without waiting for completion.

Returns a \`taskId\` immediately. This is Snapchat's \`report_run_id\`.
Use \`snapchat_check_report_status\` to poll for completion, then \`snapchat_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`snapchat_submit_report\` → get \`taskId\`
2. \`snapchat_check_report_status\` (repeat every 10s) → wait for "COMPLETE"
3. \`snapchat_download_report\` with the \`downloadUrl\` → get parsed data

Use \`snapchat_get_report\` instead for a blocking convenience shortcut.`;

export const SubmitReportInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startTime+endTime (not both). Converted to ISO 8601 timestamps automatically"),
    startTime: z
      .string()
      .optional()
      .describe("Start time in ISO 8601 format (e.g. 2024-01-01T00:00:00Z, required if datePreset not provided)"),
    endTime: z
      .string()
      .optional()
      .describe("End time in ISO 8601 format (e.g. 2024-01-31T23:59:59Z, required if datePreset not provided)"),
    granularity: z
      .enum(["TOTAL", "DAY", "HOUR", "LIFETIME"])
      .optional()
      .default("DAY")
      .describe("Time granularity (default: DAY)"),
    dimensionType: z
      .enum(["CAMPAIGN", "AD_SQUAD", "AD"])
      .optional()
      .describe("Entity level for stats breakdown (default: account-level aggregate)"),
  })
  .refine(
    (data) => data.datePreset !== undefined || (data.startTime !== undefined && data.endTime !== undefined),
    { message: "Provide either datePreset or both startTime and endTime" }
  )
  .describe("Parameters for submitting a Snapchat Ads report");

export const SubmitReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID for status polling"),
    timestamp: z.string().datetime(),
  })
  .describe("Report submission result");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartTime = input.startTime;
  let resolvedEndTime = input.endTime;
  if (input.datePreset) {
    const { startDate, endDate } = resolveDatePreset(input.datePreset);
    resolvedStartTime = `${startDate}T00:00:00Z`;
    resolvedEndTime = `${endDate}T23:59:59Z`;
  }

  const result = await snapchatReportingService.submitReport(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: resolvedStartTime!,
      end_time: resolvedEndTime!,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
    },
    context
  );

  return {
    taskId: result.task_id,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.taskId}\n\nUse \`snapchat_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const submitReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SubmitReportInputSchema,
  outputSchema: SubmitReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit campaign performance report",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
        dimensionType: "CAMPAIGN",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
