// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { computeMetrics, resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_get_report_breakdowns";
const TOOL_TITLE = "Get Pinterest Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Pinterest Ads report with additional columns for breakdowns.

Like \`pinterest_get_report\` but adds extra columns for more granular data.

**Common extra columns:** COUNTRY_CODE, DEVICE_TYPE, GENDER, AGE_BUCKET

Results include metrics broken down by the additional columns.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Ad Account ID"),
    type: z
      .enum(["CAMPAIGN", "AD_GROUP", "AD", "KEYWORD", "ACCOUNT"])
      .optional()
      .default("CAMPAIGN")
      .describe("Report type (default: CAMPAIGN)"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Base columns/metrics to include (e.g. ['IMPRESSION_1', 'CLICKTHROUGH_1', 'SPEND_IN_DOLLAR'])"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Additional breakdown columns to add (e.g. ['COUNTRY_CODE', 'DEVICE_TYPE'])"),
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
    campaignIds: z
      .array(z.string())
      .optional()
      .describe("Filter by campaign IDs"),
    adGroupIds: z
      .array(z.string())
      .optional()
      .describe("Filter by ad group IDs"),
    adIds: z
      .array(z.string())
      .optional()
      .describe("Filter by ad IDs"),
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
  .describe("Parameters for generating a Pinterest Ads report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report token/task ID"),
    headers: z.array(z.string()).describe("CSV column headers"),
    rows: z.array(z.array(z.string())).describe("CSV data rows"),
    totalRows: z.number().describe("Total number of data rows"),
    appliedColumns: z.array(z.string()).describe("All columns used (base + breakdowns)"),
    timestamp: z.string().datetime(),
  })
  .describe("Report with breakdowns result");

type GetReportBreakdownsInput = z.infer<typeof GetReportBreakdownsInputSchema>;
type GetReportBreakdownsOutput = z.infer<typeof GetReportBreakdownsOutputSchema>;

export async function getReportBreakdownsLogic(
  input: GetReportBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportBreakdownsOutput> {
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await pinterestReportingService.getReportBreakdowns(
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
    input.breakdowns,
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
    appliedColumns: [...input.columns, ...input.breakdowns],
    timestamp: new Date().toISOString(),
  };
}

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex(h => h.toUpperCase() === name.toUpperCase());
  const spendIdx = idx('SPEND_IN_DOLLAR');
  const impIdx = idx('IMPRESSION_1');
  const clickIdx = idx('CLICKTHROUGH_1');
  const convIdx = idx('TOTAL_CONVERSIONS');

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

export function getReportBreakdownsResponseFormatter(result: GetReportBreakdownsOutput): McpTextContent[] {
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
        `Applied columns: ${result.appliedColumns.join(", ")}`,
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
        adAccountId: "1234567890",
        type: "CAMPAIGN",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR"],
        breakdowns: ["COUNTRY_CODE"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
      },
    },
    {
      label: "Ad group report broken down by device type",
      input: {
        adAccountId: "1234567890",
        type: "AD_GROUP",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR"],
        breakdowns: ["DEVICE_TYPE"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        granularity: "TOTAL",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};
