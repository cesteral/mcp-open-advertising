// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  arrayRowsToRecords,
  computeMetrics,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  resolveDatePreset,
  DATE_PRESET_VALUES,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_get_report_breakdowns";
const TOOL_TITLE = "Get TikTok Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async TikTok Ads report with dimensional breakdowns.

Like \`tiktok_get_report\` but adds breakdown dimensions for more granular data.

**Common breakdown dimensions:** country_code, platform, gender, age, interest_category, placement

Results are broken down by each combination of base dimensions + breakdown dimensions.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    reportType: z
      .enum(["BASIC", "AUDIENCE", "PLAYABLE_MATERIAL"])
      .optional()
      .default("BASIC")
      .describe("Report type (default: BASIC)"),
    dimensions: z
      .array(z.string())
      .min(1)
      .describe("Base dimensions for the report (e.g., ['campaign_id', 'stat_time_day'])"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Breakdown dimensions to add (e.g., ['country_code', 'gender'])"),
    metrics: z
      .array(z.string())
      .min(1)
      .describe("Metrics to include (e.g., ['impressions', 'clicks', 'spend'])"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startDate+endDate (not both)"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Start date (YYYY-MM-DD, required if datePreset not provided)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("End date (YYYY-MM-DD, required if datePreset not provided)"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC derived from raw metrics"),
  })
  .merge(ReportViewInputSchema)
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for generating a TikTok Ads report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    ...ReportViewOutputSchema.shape,
    appliedDimensions: z.array(z.string()).describe("All dimensions used (base + breakdowns)"),
    timestamp: z.string().datetime(),
  })
  .describe("Report with breakdowns result");

type GetReportBreakdownsInput = z.infer<typeof GetReportBreakdownsInputSchema>;
type GetReportBreakdownsOutput = z.infer<typeof GetReportBreakdownsOutputSchema>;

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const spendIdx = idx("spend");
  const impIdx = idx("impressions");
  const clickIdx = idx("clicks");
  const convIdx = idx("conversions");

  const newHeaders = [
    ...headers,
    "computed_cpa",
    "computed_roas",
    "computed_cpm",
    "computed_ctr",
    "computed_cpc",
  ];
  const newRows = rows.map((row) => {
    const cost = spendIdx >= 0 ? Number(row[spendIdx] || 0) : 0;
    const impressions = impIdx >= 0 ? Number(row[impIdx] || 0) : 0;
    const clicks = clickIdx >= 0 ? Number(row[clickIdx] || 0) : 0;
    const conversions = convIdx >= 0 ? Number(row[convIdx] || 0) : 0;
    const m = computeMetrics({ cost, impressions, clicks, conversions, conversionValue: 0 });
    return [
      ...row,
      m.cpa !== null ? String(m.cpa) : "",
      m.roas !== null ? String(m.roas) : "",
      m.cpm !== null ? String(m.cpm) : "",
      m.ctr !== null ? String(m.ctr) : "",
      m.cpc !== null ? String(m.cpc) : "",
    ];
  });
  return { headers: newHeaders, rows: newRows };
}

export async function getReportBreakdownsLogic(
  input: GetReportBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportBreakdownsOutput> {
  const { tiktokReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await tiktokReportingService.getReportBreakdowns(
    {
      report_type: input.reportType,
      dimensions: input.dimensions,
      metrics: input.metrics,
      start_date: resolvedStartDate!,
      end_date: resolvedEndDate!,
    },
    input.breakdowns,
    getReportViewFetchLimit(input),
    context
  );

  let headers = result.headers;
  let rows = result.rows;

  if (input.includeComputedMetrics) {
    ({ headers, rows } = appendComputedMetricsToRows(headers, rows));
  }

  return {
    taskId: result.taskId,
    ...createReportView({
      headers,
      rows: arrayRowsToRecords(headers, rows),
      totalRows: result.totalRows,
      input,
    }),
    appliedDimensions: [...input.dimensions, ...input.breakdowns],
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(
  result: GetReportBreakdownsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report task: ${result.taskId}\nApplied dimensions: ${result.appliedDimensions.join(", ")}\n\n${formatReportViewResponse(result, "Report data")}`,
    },
  ];
}

export const getReportBreakdownsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportBreakdownsInputSchema,
  outputSchema: GetReportBreakdownsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign report broken down by country",
      input: {
        advertiserId: "1234567890",
        dimensions: ["campaign_id", "stat_time_day"],
        breakdowns: ["country_code"],
        metrics: ["impressions", "clicks", "spend", "ctr"],
        datePreset: "LAST_7_DAYS",
      },
    },
    {
      label: "Ad group report broken down by gender and age",
      input: {
        advertiserId: "1234567890",
        dimensions: ["adgroup_id"],
        breakdowns: ["gender", "age"],
        metrics: ["impressions", "clicks", "spend", "conversions"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};
