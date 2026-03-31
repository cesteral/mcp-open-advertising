// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { computeMetrics, resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_report";
const TOOL_TITLE = "Get Snapchat Ads Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async Snapchat Ads performance report.

Follows the async polling pattern: submit task → poll until COMPLETE → download CSV.
This may take 30s–5 minutes depending on the data volume.

**Common fields:** impressions, swipes, spend, video_views, conversion_purchases, reach, frequency, cpm, cpsu
**Granularity:** DAY (default), HOUR, LIFETIME
**start_time/end_time:** ISO 8601 format (e.g. 2024-01-01T00:00:00Z)`;

export const GetReportInputSchema = z
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
      .enum(["DAY", "HOUR", "LIFETIME"])
      .optional()
      .default("DAY")
      .describe("Time granularity (default: DAY)"),
    dimensionType: z
      .enum(["CAMPAIGN", "AD_SQUAD", "AD"])
      .optional()
      .describe("Entity level for stats breakdown (default: account-level aggregate)"),
    filters: z
      .array(z.object({
        field: z.string().describe("Filter field (e.g. campaign_id)"),
        operator: z.string().describe("Filter operator (e.g. IN)"),
        values: z.array(z.string()).describe("Filter values"),
      }))
      .optional()
      .describe("Optional filters for the report"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC derived from raw metrics"),
  })
  .refine(
    (data) => data.datePreset !== undefined || (data.startTime !== undefined && data.endTime !== undefined),
    { message: "Provide either datePreset or both startTime and endTime" }
  )
  .describe("Parameters for generating a Snapchat Ads report");

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
  const clickIdx = idx('swipes'); // Snapchat calls clicks "swipes"
  const convIdx = idx('conversion_purchases');

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
  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartTime = input.startTime;
  let resolvedEndTime = input.endTime;
  if (input.datePreset) {
    const { startDate, endDate } = resolveDatePreset(input.datePreset);
    resolvedStartTime = `${startDate}T00:00:00Z`;
    resolvedEndTime = `${endDate}T23:59:59Z`;
  }

  const result = await snapchatReportingService.getReport(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: resolvedStartTime!,
      end_time: resolvedEndTime!,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
      ...(input.filters ? { filters: input.filters } : {}),
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
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend", "cpm"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
        filters: [{ field: "campaign_id", operator: "IN", values: ["camp_123"] }],
      },
    },
    {
      label: "Ad squad performance report",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend", "conversion_purchases"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};
