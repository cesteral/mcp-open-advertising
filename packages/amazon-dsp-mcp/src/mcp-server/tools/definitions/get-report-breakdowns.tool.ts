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
import { AMAZON_DSP_REPORTING_CONTRACT } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_get_report_breakdowns";
const TOOL_TITLE = "Get Amazon DSP Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Amazon DSP report (legacy /dsp/reports API) with additional breakdown dimensions appended to the base set.

Like \`amazon_dsp_get_report\` but the \`breakdowns\` array is concatenated onto \`dimensions\` before submitting — convenient when iterating "show me X also broken down by Y".

**Allowed \`type\`:** CAMPAIGN, INVENTORY, AUDIENCE, PRODUCTS, TECHNOLOGY, GEOGRAPHY, CONVERSION_SOURCE.
**CAMPAIGN \`dimensions\` (base + breakdowns):** ORDER, LINE_ITEM, CREATIVE.

Note: Amazon DSP has a maximum 95-day lookback.`;

export const GetReportBreakdownsInputSchema = z
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
      .describe("Start date (YYYY-MM-DD format). Required if datePreset not provided."),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("End date (YYYY-MM-DD format). Required if datePreset not provided."),
    type: z
      .enum(AMAZON_DSP_REPORTING_CONTRACT.reportTypes)
      .describe(
        `Report category. One of: ${AMAZON_DSP_REPORTING_CONTRACT.reportTypes.join(", ")}.`
      ),
    dimensions: z
      .array(z.string())
      .optional()
      .describe("Base grouping dimensions (CAMPAIGN: ORDER, LINE_ITEM, CREATIVE)."),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe(
        "Additional dimensions appended to `dimensions` before submitting. Same allowed values as `dimensions`."
      ),
    metrics: z
      .array(z.string())
      .optional()
      .describe("Metric names. Joined to comma-string upstream."),
    timeUnit: z
      .enum(["DAILY", "SUMMARY"])
      .optional()
      .default("DAILY")
      .describe("Time unit for the report (default: DAILY)"),
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
  .describe("Parameters for generating an Amazon DSP report with breakdowns");

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

export async function getReportBreakdownsLogic(
  input: GetReportBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportBreakdownsOutput> {
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await amazonDspReportingService.getReportBreakdowns(
    {
      startDate: resolvedStartDate!,
      endDate: resolvedEndDate!,
      type: input.type,
      dimensions: input.dimensions,
      metrics: input.metrics,
      timeUnit: input.timeUnit,
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
      input: { ...input, columns: input.metrics ?? [] },
    }),
    appliedDimensions: [...(input.dimensions ?? []), ...input.breakdowns],
    timestamp: new Date().toISOString(),
  };
}

function appendComputedMetricsToRows(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][] } {
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const costIdx = idx("totalCost");
  const impIdx = idx("impressions");
  const clickIdx = idx("clickThroughs");
  const convIdx = idx("purchases14d");

  const newHeaders = [
    ...headers,
    "computed_cpa",
    "computed_roas",
    "computed_cpm",
    "computed_ctr",
    "computed_cpc",
  ];
  const newRows = rows.map((row) => {
    const cost = costIdx >= 0 ? Number(row[costIdx] || 0) : 0;
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
      label: "ORDER-level CAMPAIGN report broken down by CREATIVE",
      input: {
        datePreset: "LAST_7_DAYS",
        type: "CAMPAIGN",
        dimensions: ["ORDER"],
        breakdowns: ["CREATIVE"],
        metrics: ["impressions", "totalCost"],
        timeUnit: "DAILY",
      },
    },
    {
      label: "ORDER-level CAMPAIGN summary broken down by LINE_ITEM",
      input: {
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        type: "CAMPAIGN",
        dimensions: ["ORDER"],
        breakdowns: ["LINE_ITEM"],
        metrics: ["impressions", "totalCost", "viewableImpressions"],
        timeUnit: "SUMMARY",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};
