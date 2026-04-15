// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { computeMetrics, resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_get_report";
const TOOL_TITLE = "Get Amazon DSP Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async Amazon DSP performance report.

Follows the async polling pattern: submit task → poll until COMPLETED → download data.
This may take 30s–5 minutes depending on the data volume.

**Report type IDs:** dspLineItem, dspOrder, dspCreative, dspAudience
**Common columns:** impressions, clickThroughs, totalCost, dpv14d, purchases14d
**Common groupBy:** order, lineItem, creative, audience, date

Note: Amazon DSP has a maximum 95-day lookback. LAST_90_DAYS is supported; avoid custom ranges beyond 95 days.`;

export const GetReportInputSchema = z
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
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC"),
  })
  .refine(
    (data) => data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for generating an Amazon DSP report");

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

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await amazonDspReportingService.getReport(
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

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const costIdx = idx('totalCost');
  const impIdx = idx('impressions');
  const clickIdx = idx('clickThroughs');
  const convIdx = idx('purchases14d');

  const newHeaders = [...headers, 'computed_cpa', 'computed_roas', 'computed_cpm', 'computed_ctr', 'computed_cpc'];
  const newRows = rows.map(row => {
    const cost = costIdx >= 0 ? Number(row[costIdx] || 0) : 0;
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
      label: "Line item delivery report for last 7 days",
      input: {
        accountId: "1234567890",
        datePreset: "LAST_7_DAYS",
        reportTypeId: "dspLineItem",
        groupBy: ["order", "lineItem"],
        columns: ["impressions", "clickThroughs", "totalCost"],
        timeUnit: "DAILY",
      },
    },
    {
      label: "Order performance report",
      input: {
        accountId: "1234567890",
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        reportTypeId: "dspOrder",
        groupBy: ["order"],
        columns: ["impressions", "clickThroughs", "totalCost", "dpv14d", "purchases14d"],
        timeUnit: "SUMMARY",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};
