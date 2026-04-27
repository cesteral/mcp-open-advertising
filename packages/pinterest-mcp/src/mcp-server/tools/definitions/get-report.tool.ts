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

const TOOL_NAME = "pinterest_get_report";
const TOOL_TITLE = "Get Pinterest Ads Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async Pinterest Ads performance report.

Follows the async polling pattern: submit task → poll until FINISHED → download CSV.
This may take 30s–5 minutes depending on the data volume.

**Common columns:** IMPRESSION_1, CLICKTHROUGH_1, SPEND_IN_DOLLAR, CTR, CPM, CPC, TOTAL_CONVERSIONS, REACH
**Report types:** CAMPAIGN (default), AD_GROUP, AD, KEYWORD, ACCOUNT
**Granularity:** DAY (default), TOTAL, HOUR, WEEK, MONTH`;

export const GetReportInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Pinterest Ad Account ID"),
    type: z
      .enum(["CAMPAIGN", "AD_GROUP", "AD", "KEYWORD", "ACCOUNT"])
      .optional()
      .default("CAMPAIGN")
      .describe("Report type (default: CAMPAIGN)"),
    columns: z
      .array(z.string())
      .min(1)
      .describe(
        "Columns/metrics to include (e.g. ['IMPRESSION_1', 'CLICKTHROUGH_1', 'SPEND_IN_DOLLAR'])"
      ),
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
    granularity: z
      .enum(["TOTAL", "DAY", "HOUR", "WEEK", "MONTH"])
      .optional()
      .default("DAY")
      .describe("Time granularity for the report (default: DAY)"),
    campaignIds: z.array(z.string()).optional().describe("Filter by campaign IDs"),
    adGroupIds: z.array(z.string()).optional().describe("Filter by ad group IDs"),
    adIds: z.array(z.string()).optional().describe("Filter by ad IDs"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC"),
  })
  .merge(ReportViewInputSchema.omit({ columns: true }))
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for generating a Pinterest Ads report");

export const GetReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report token/task ID"),
    ...ReportViewOutputSchema.shape,
    timestamp: z.string().datetime(),
  })
  .describe("Report result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await pinterestReportingService.getReport(
    {
      type: input.type,
      columns: input.columns,
      start_date: resolvedStartDate!,
      end_date: resolvedEndDate!,
      granularity: input.granularity,
      ...(input.campaignIds ? { campaign_ids: input.campaignIds } : {}),
      ...(input.adGroupIds ? { ad_group_ids: input.adGroupIds } : {}),
      ...(input.adIds ? { ad_ids: input.adIds } : {}),
    },
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
    timestamp: new Date().toISOString(),
  };
}

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex((h) => h.toUpperCase() === name.toUpperCase());
  const spendIdx = idx("SPEND_IN_DOLLAR");
  const impIdx = idx("IMPRESSION_1");
  const clickIdx = idx("CLICKTHROUGH_1");
  const convIdx = idx("TOTAL_CONVERSIONS");

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

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report task: ${result.taskId}\n\n${formatReportViewResponse(result, "Report data")}`,
    },
  ];
}

export const getReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportInputSchema,
  outputSchema: GetReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign delivery report for last 7 days",
      input: {
        adAccountId: "1234567890",
        type: "CAMPAIGN",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "CTR", "CPM"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
      },
    },
    {
      label: "Ad group performance report",
      input: {
        adAccountId: "1234567890",
        type: "AD_GROUP",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "TOTAL_CONVERSIONS"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        granularity: "TOTAL",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};
