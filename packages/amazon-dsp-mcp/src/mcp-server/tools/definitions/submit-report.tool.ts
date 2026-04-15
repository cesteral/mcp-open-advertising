// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_submit_report";
const TOOL_TITLE = "Submit Amazon DSP Report";
const TOOL_DESCRIPTION = `Submit an Amazon DSP report task without waiting for completion.

Returns a \`taskId\` immediately. Use \`amazon_dsp_check_report_status\` to poll for completion, then \`amazon_dsp_download_report\` to fetch results.

**Non-blocking workflow:**
1. \`amazon_dsp_submit_report\` → get \`taskId\`
2. \`amazon_dsp_check_report_status\` (repeat every 10s) → wait for "COMPLETED"
3. \`amazon_dsp_download_report\` with the \`downloadUrl\` → get parsed data

Use \`amazon_dsp_get_report\` instead for a blocking convenience shortcut.

Note: Amazon DSP has a maximum 95-day lookback. LAST_90_DAYS is the longest supported preset.`;

export const SubmitReportInputSchema = z
  .object({
    accountId: z
      .string()
      .min(1)
      .describe("Amazon DSP account (entity) ID used in the reporting URL path"),
    name: z
      .string()
      .optional()
      .describe("Report name (optional)"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startDate+endDate (not both). Max 95-day lookback — LAST_90_DAYS is the longest supported preset"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Start date (YYYY-MM-DD format, e.g. 2024-01-01). Max 95-day lookback. Required if datePreset not provided."),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("End date (YYYY-MM-DD format, e.g. 2024-01-31). Required if datePreset not provided."),
    reportTypeId: z
      .string()
      .min(1)
      .describe("Report type ID (e.g. dspLineItem, dspOrder, dspCreative)"),
    groupBy: z
      .array(z.string())
      .min(1)
      .describe("Dimensions to group by (e.g. ['order', 'lineItem'])"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Metrics/columns to include (e.g. ['impressions', 'clickThroughs', 'totalCost'])"),
    timeUnit: z
      .enum(["DAILY", "SUMMARY"])
      .optional()
      .default("DAILY")
      .describe("Time unit for the report (default: DAILY)"),
    adProduct: z
      .string()
      .optional()
      .default("DEMAND_SIDE_PLATFORM")
      .describe("Ad product (default: DEMAND_SIDE_PLATFORM). Options: DEMAND_SIDE_PLATFORM, SPONSORED_PRODUCTS, SPONSORED_BRANDS, SPONSORED_DISPLAY, SPONSORED_TELEVISION, ALL"),
  })
  .refine(
    (data) => data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
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
    input.accountId,
    {
      name: input.name,
      startDate: resolvedStartDate!,
      endDate: resolvedEndDate!,
      configuration: {
        adProduct: input.adProduct,
        groupBy: input.groupBy,
        columns: input.columns,
        reportTypeId: input.reportTypeId,
        timeUnit: input.timeUnit,
      },
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
      label: "Submit line item performance report",
      input: {
        accountId: "1234567890",
        datePreset: "LAST_7_DAYS",
        reportTypeId: "dspLineItem",
        groupBy: ["order", "lineItem"],
        columns: ["impressions", "clickThroughs", "totalCost"],
        timeUnit: "DAILY",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
