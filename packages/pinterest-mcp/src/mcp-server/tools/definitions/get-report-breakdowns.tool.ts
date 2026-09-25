// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
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
import { PINTEREST_REPORT_TARGETING_TYPES } from "../../../services/pinterest/pinterest-reporting-service.js";

const TOOL_NAME = "pinterest_get_report_breakdowns";
const TOOL_TITLE = "Get Pinterest Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Pinterest Ads report broken down by targeting dimensions.

Like \`pinterest_get_report\`, but Pinterest v5 breakdowns are not extra columns: each breakdown is a \`targeting_types\` value, and the report runs at the \`*_TARGETING\` variant of the report type (CAMPAIGN_TARGETING, AD_GROUP_TARGETING, PIN_PROMOTION_TARGETING for AD, ADVERTISER_TARGETING for ACCOUNT). KEYWORD reports cannot be broken down.

**Breakdowns (up to 5):** ${PINTEREST_REPORT_TARGETING_TYPES.join(", ")}`;

export const GetReportBreakdownsInputSchema = z
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
        "Base columns/metrics to include (e.g. ['IMPRESSION_1', 'CLICKTHROUGH_1', 'SPEND_IN_DOLLAR'])"
      ),
    breakdowns: z
      .array(z.enum(PINTEREST_REPORT_TARGETING_TYPES))
      .min(1)
      .max(5)
      .describe(
        "Targeting breakdowns, sent as Pinterest targeting_types (e.g. ['COUNTRY', 'AGE_BUCKET'])"
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
  .describe("Parameters for generating a Pinterest Ads report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report token/task ID"),
    ...ReportViewOutputSchema.shape,
    appliedColumns: z.array(z.string()).describe("Metric columns requested"),
    appliedBreakdowns: z.array(z.string()).describe("Targeting breakdowns requested"),
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
  const { pinterestReportingService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

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
      // No column projection: the targeting breakdown dimensions arrive as
      // extra CSV columns whose header names are Pinterest's, not the request's,
      // so projecting to the requested metric columns would drop them.
      input: { ...input, columns: undefined },
    }),
    appliedColumns: input.columns,
    appliedBreakdowns: input.breakdowns,
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

export function getReportBreakdownsResponseFormatter(
  result: GetReportBreakdownsOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report task: ${result.taskId}\nApplied columns: ${result.appliedColumns.join(", ")}\nBreakdowns: ${result.appliedBreakdowns.join(", ")}\n\n${formatReportViewResponse(result, "Report data")}`,
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
        breakdowns: ["COUNTRY"],
        datePreset: "LAST_7_DAYS",
        granularity: "DAY",
      },
    },
    {
      label: "Ad group report broken down by age and gender",
      input: {
        adAccountId: "1234567890",
        type: "AD_GROUP",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR"],
        breakdowns: ["AGE_BUCKET", "GENDER"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        granularity: "TOTAL",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
