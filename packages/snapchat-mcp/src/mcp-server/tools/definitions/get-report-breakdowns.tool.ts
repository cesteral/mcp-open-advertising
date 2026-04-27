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

const TOOL_NAME = "snapchat_get_report_breakdowns";
const TOOL_TITLE = "Get Snapchat Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Snapchat Ads report with additional breakdown fields.

Like \`snapchat_get_report\` but adds extra breakdown fields for more granular data.

**Common breakdown fields:** country_code, platform, gender, age, interest_category, placement

Results include metrics with the additional breakdown field values.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Base metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Additional breakdown fields to add (e.g. ['country_code', 'gender'])"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe(
        "Preset date range. Use this OR startTime+endTime (not both). Converted to ISO 8601 timestamps automatically"
      ),
    startTime: z
      .string()
      .optional()
      .describe(
        "Start time in ISO 8601 format (e.g. 2024-01-01T00:00:00Z, required if datePreset not provided)"
      ),
    endTime: z
      .string()
      .optional()
      .describe(
        "End time in ISO 8601 format (e.g. 2024-01-31T23:59:59Z, required if datePreset not provided)"
      ),
    granularity: z
      .enum(["TOTAL", "DAY", "HOUR", "LIFETIME"])
      .optional()
      .default("DAY")
      .describe("Time granularity (default: DAY)"),
    dimensionType: z
      .enum(["CAMPAIGN", "AD_SQUAD", "AD"])
      .optional()
      .describe("Entity level for stats breakdown (default: account-level aggregate)"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC derived from raw metrics"),
  })
  .merge(ReportViewInputSchema)
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startTime !== undefined && data.endTime !== undefined),
    { message: "Provide either datePreset or both startTime and endTime" }
  )
  .describe("Parameters for generating a Snapchat Ads report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    ...ReportViewOutputSchema.shape,
    appliedFields: z.array(z.string()).describe("All fields used (base + breakdowns)"),
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
  const clickIdx = idx("swipes"); // Snapchat calls clicks "swipes"
  const convIdx = idx("conversion_purchases");

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
  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartTime = input.startTime;
  let resolvedEndTime = input.endTime;
  if (input.datePreset) {
    const { startDate, endDate } = resolveDatePreset(input.datePreset);
    resolvedStartTime = `${startDate}T00:00:00Z`;
    resolvedEndTime = `${endDate}T23:59:59Z`;
  }

  const result = await snapchatReportingService.getReportBreakdowns(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: resolvedStartTime!,
      end_time: resolvedEndTime!,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
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
    appliedFields: [...input.fields, ...input.breakdowns],
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(
  result: GetReportBreakdownsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report task: ${result.taskId}\nApplied fields: ${result.appliedFields.join(", ")}\n\n${formatReportViewResponse(result, "Report data")}`,
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
        fields: ["impressions", "swipes", "spend"],
        breakdowns: ["country_code"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
      },
    },
    {
      label: "Ad squad report broken down by gender and age",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        breakdowns: ["gender", "age"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};
