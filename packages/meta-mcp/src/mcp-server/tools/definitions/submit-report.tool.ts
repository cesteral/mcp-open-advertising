// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_submit_report";
const TOOL_TITLE = "Submit Meta Async Insights Report";
const TOOL_DESCRIPTION = `Submit a Meta Ads async insights report without waiting for completion.

Returns a \`reportRunId\` immediately. Use \`meta_check_report_status\` to poll for completion, then \`meta_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`meta_submit_report\` → get \`reportRunId\`
2. \`meta_check_report_status\` (repeat every 10s) → wait for "Job Succeeded"
3. \`meta_download_report\` with the \`reportRunId\` → get parsed data

**Status values:** "Job Not Started", "Job Started", "Job Running", "Job Succeeded", "Job Failed"

Use \`meta_get_insights\` instead for a blocking convenience shortcut on smaller date ranges.`;

export const SubmitReportInputSchema = z
  .object({
    entityId: z
      .string()
      .min(1)
      .describe("Entity ID to get insights for (account act_XXX, campaign, ad set, or ad ID)"),
    fields: z
      .array(z.string())
      .optional()
      .describe("Metrics/fields to return (defaults to 12 core metrics)"),
    datePreset: z
      .string()
      .optional()
      .describe("Date preset (today, yesterday, last_7d, last_30d, etc.)"),
    timeRange: z
      .object({
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").describe("Start date YYYY-MM-DD"),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").describe("End date YYYY-MM-DD"),
      })
      .optional()
      .describe("Custom date range (mutually exclusive with datePreset)"),
    timeIncrement: z
      .string()
      .optional()
      .describe("Time granularity: '1' for daily, '7' for weekly, 'monthly', 'all_days'"),
    level: z
      .string()
      .optional()
      .describe("Aggregation level: 'account', 'campaign', 'adset', 'ad'"),
    breakdowns: z
      .array(z.string())
      .optional()
      .describe("Breakdown dimensions (e.g., ['age', 'gender', 'country'])"),
  })
  .describe("Parameters for submitting a Meta Ads async insights report");

export const SubmitReportOutputSchema = z
  .object({
    reportRunId: z.string().describe("Report run ID for status polling and result download"),
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
  const { metaInsightsService } = resolveSessionServices(sdkContext);

  const result = await metaInsightsService.submitInsightsReport(
    input.entityId,
    {
      fields: input.fields,
      datePreset: input.datePreset,
      timeRange: input.timeRange,
      timeIncrement: input.timeIncrement,
      level: input.level,
      breakdowns: input.breakdowns,
    },
    context
  );

  return {
    reportRunId: result.reportRunId,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.reportRunId}\n\nUse \`meta_check_report_status\` with this reportRunId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
      label: "Submit last 30 days campaign performance report",
      input: {
        entityId: "act_123456789",
        datePreset: "last_30d",
        level: "campaign",
      },
    },
    {
      label: "Submit custom date range report with breakdowns",
      input: {
        entityId: "23456789012345",
        fields: ["impressions", "clicks", "spend", "actions", "action_values"],
        timeRange: { since: "2026-01-01", until: "2026-01-31" },
        timeIncrement: "1",
        breakdowns: ["age", "gender"],
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
