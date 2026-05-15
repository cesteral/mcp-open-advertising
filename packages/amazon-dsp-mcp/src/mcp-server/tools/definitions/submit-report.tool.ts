// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import { AMAZON_DSP_REPORTING_CONTRACT } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_submit_report";
const TOOL_TITLE = "Submit Amazon DSP Report";
const TOOL_DESCRIPTION = `Submit an Amazon DSP report (legacy /dsp/reports API) without waiting for completion.

Returns a \`taskId\` immediately. Use \`amazon_dsp_check_report_status\` to poll for completion (\`SUCCESS\` or \`FAILURE\`), then \`amazon_dsp_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`amazon_dsp_submit_report\` → get \`taskId\`
2. \`amazon_dsp_check_report_status\` (repeat every 10s) → wait for \`SUCCESS\`
3. \`amazon_dsp_download_report\` with the \`downloadUrl\` → parsed data

Use \`amazon_dsp_get_report\` instead for a blocking convenience shortcut.

**Report shape:** each \`type\` (CAMPAIGN, INVENTORY, AUDIENCE, PRODUCTS, TECHNOLOGY, GEOGRAPHY, CONVERSION_SOURCE) is a fixed report category. CAMPAIGN supports breaking down by \`ORDER | LINE_ITEM | CREATIVE\` via \`dimensions\`. \`metrics\` is the list of metric names (impressions, totalCost, viewableImpressions, viewabilityRate, …) — sent to Amazon as a comma-separated string.

Note: Amazon DSP has a maximum 95-day lookback. LAST_90_DAYS is the longest supported preset.`;

export const SubmitReportInputSchema = z
  .object({
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe(
        "Preset date range. Use this OR startDate+endDate (not both). Max 95-day lookback — LAST_90_DAYS is the longest supported preset"
      ),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "Start date (YYYY-MM-DD format, e.g. 2026-05-01). Max 95-day lookback. Required if datePreset not provided. Converted to YYYYMMDD for the upstream API."
      ),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "End date (YYYY-MM-DD format). Required if datePreset not provided. Converted to YYYYMMDD for the upstream API."
      ),
    type: z
      .enum(AMAZON_DSP_REPORTING_CONTRACT.reportTypes)
      .describe(
        `Report category. One of: ${AMAZON_DSP_REPORTING_CONTRACT.reportTypes.join(", ")}.`
      ),
    dimensions: z
      .array(z.string())
      .optional()
      .describe(
        "Optional grouping dimensions (type-specific). CAMPAIGN supports ORDER, LINE_ITEM, CREATIVE."
      ),
    metrics: z
      .array(z.string())
      .optional()
      .describe(
        "Metric names to include (e.g. ['impressions', 'totalCost']). Joined to a comma-separated string upstream. Amazon will 422 with the authoritative invalid-list if any name is unknown."
      ),
    timeUnit: z
      .enum(["DAILY", "SUMMARY"])
      .optional()
      .default("DAILY")
      .describe("Time unit for the report (default: DAILY)"),
  })
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for submitting an Amazon DSP report");

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
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await amazonDspReportingService.submitReport(
    {
      startDate: resolvedStartDate!,
      endDate: resolvedEndDate!,
      type: input.type,
      dimensions: input.dimensions,
      metrics: input.metrics,
      timeUnit: input.timeUnit,
    },
    context
  );

  return {
    taskId: result.taskId,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.taskId}\n\nUse \`amazon_dsp_check_report_status\` with this taskId to poll for completion.\n\nTimestamp: ${result.timestamp}`,
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
      label: "Daily order-level CAMPAIGN report, last 7 days",
      input: {
        datePreset: "LAST_7_DAYS",
        type: "CAMPAIGN",
        dimensions: ["ORDER"],
        metrics: ["impressions", "totalCost"],
        timeUnit: "DAILY",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
