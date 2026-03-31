// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { computeMetrics, resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "tiktok_get_report";
const TOOL_TITLE = "Get TikTok Ads Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async TikTok Ads performance report.

Follows the async polling pattern: submit task → poll until DONE → download CSV.
This may take 30s–5 minutes depending on the data volume.

**Common dimensions:** campaign_id, adgroup_id, ad_id, stat_time_day, stat_time_hour, country_code
**Common metrics:** spend, impressions, clicks, ctr, cpm, cpc, conversions, conversion_rate, reach, frequency

**Report types:** BASIC (default), AUDIENCE, PLAYABLE_MATERIAL`;

export const GetReportInputSchema = z
  .object({
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"),
    reportType: z
      .enum(["BASIC", "AUDIENCE", "PLAYABLE_MATERIAL"])
      .optional()
      .default("BASIC")
      .describe("Report type (default: BASIC)"),
    dimensions: z
      .array(z.string())
      .min(1)
      .describe("Dimensions for the report (e.g., ['campaign_id', 'stat_time_day'])"),
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
    orderField: z
      .string()
      .optional()
      .describe("Field to order results by"),
    orderType: z
      .enum(["ASC", "DESC"])
      .optional()
      .describe("Sort order"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC derived from raw metrics"),
  })
  .refine(
    (data) => data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for generating a TikTok Ads report");

export const GetReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    headers: z.array(z.string()).describe("CSV column headers"),
    rows: z.array(z.array(z.string())).describe("CSV data rows"),
    totalRows: z.number().describe("Total number of data rows"),
    timestamp: z.string().datetime(),
  })
  .describe("Report result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const spendIdx = idx('spend');
  const impIdx = idx('impressions');
  const clickIdx = idx('clicks');
  const convIdx = idx('conversions');

  const newHeaders = [...headers, 'computed_cpa', 'computed_roas', 'computed_cpm', 'computed_ctr', 'computed_cpc'];
  const newRows = rows.map(row => {
    const cost = spendIdx >= 0 ? Number(row[spendIdx] || 0) : 0;
    const impressions = impIdx >= 0 ? Number(row[impIdx] || 0) : 0;
    const clicks = clickIdx >= 0 ? Number(row[clickIdx] || 0) : 0;
    const conversions = convIdx >= 0 ? Number(row[convIdx] || 0) : 0;
    const m = computeMetrics({ cost, impressions, clicks, conversions, conversionValue: 0 });
    return [...row,
      m.cpa !== null ? String(m.cpa) : '',
      m.roas !== null ? String(m.roas) : '',
      m.cpm !== null ? String(m.cpm) : '',
      m.ctr !== null ? String(m.ctr) : '',
      m.cpc !== null ? String(m.cpc) : '',
    ];
  });
  return { headers: newHeaders, rows: newRows };
}

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { tiktokReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await tiktokReportingService.getReport(
    {
      report_type: input.reportType,
      dimensions: input.dimensions,
      metrics: input.metrics,
      start_date: resolvedStartDate!,
      end_date: resolvedEndDate!,
      ...(input.orderField ? { order_field: input.orderField } : {}),
      ...(input.orderType ? { order_type: input.orderType } : {}),
    },
    context
  );

  let headers = result.headers;
  let rows = result.rows;

  if (input.includeComputedMetrics) {
    ({ headers, rows } = appendComputedMetricsToRows(headers, rows));
  }

  return {
    taskId: result.taskId,
    headers,
    rows,
    totalRows: result.totalRows,
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  const headerLine = result.headers.join(", ");
  const previewRows = result.rows.slice(0, 5).map((row) => row.join(", "));
  const truncated = result.rows.length > 5
    ? `\n... and ${result.rows.length - 5} more rows`
    : "";

  return [
    {
      type: "text" as const,
      text: [
        `Report task: ${result.taskId}`,
        `Total rows: ${result.totalRows}`,
        "",
        `Headers: ${headerLine}`,
        "",
        "Sample rows:",
        ...previewRows,
        truncated,
        "",
        `Timestamp: ${result.timestamp}`,
      ].filter((line) => line !== undefined).join("\n"),
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
        advertiserId: "1234567890",
        dimensions: ["campaign_id", "stat_time_day"],
        metrics: ["impressions", "clicks", "spend", "ctr", "cpc"],
        datePreset: "LAST_7_DAYS",
      },
    },
    {
      label: "Ad group performance report",
      input: {
        advertiserId: "1234567890",
        reportType: "BASIC",
        dimensions: ["adgroup_id"],
        metrics: ["impressions", "clicks", "spend", "conversions", "conversion_rate"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        orderField: "spend",
        orderType: "DESC",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};
