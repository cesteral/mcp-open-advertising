// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import {
  computeMetrics,
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";

const TOOL_NAME = "meta_get_insights";
const TOOL_TITLE = "Get Meta Ads Insights";
const TOOL_DESCRIPTION = `Get performance insights for a Meta Ads entity (account, campaign, ad set, or ad).

Uses GET /{entityId}/insights with date presets or custom date ranges.

**Common date presets:** today, yesterday, this_month, last_month, this_quarter, last_quarter, this_year, last_year, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d, last_week_mon_sun, last_week_sun_sat, this_week_mon_today, this_week_sun_today, maximum, data_maximum

**Common metrics (fields):** impressions, clicks, spend, cpc, cpm, ctr, reach, frequency, actions, action_values, conversions, cost_per_action_type

**Gotchas:**
- Data may lag up to 48 hours.
- Max 37-month date range.
- Limit ~20 metrics per call for best performance.
- Use \`time_increment\` for daily/weekly breakdowns (e.g., "1" for daily, "7" for weekly).
- Use \`level\` to aggregate at different levels (e.g., "campaign", "adset", "ad").`;

export const GetInsightsInputSchema = z
  .object({
    entityId: z
      .string()
      .min(1)
      .describe("Entity ID to get insights for (account act_XXX, campaign, ad set, or ad ID)"),
    fields: z
      .array(z.string())
      .optional()
      .describe("Metrics/fields to return (defaults to common metrics)"),
    datePreset: z
      .string()
      .optional()
      .describe("Date preset (today, yesterday, last_7d, last_30d, etc.)"),
    timeRange: z
      .object({
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").describe("Start date YYYY-MM-DD"),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").describe("End date YYYY-MM-DD"),
      })
      .optional()
      .describe("Custom date range (mutually exclusive with datePreset)"),
    timeIncrement: z
      .string()
      .optional()
      .describe("Time granularity: '1' for daily, '7' for weekly, 'monthly', 'all_days'"),
    level: z
      .string()
      .optional()
      .describe("Aggregation level: 'account', 'campaign', 'adset', 'ad'"),
    limit: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .describe("Deprecated. Use maxRows for the returned row count."),
    after: z
      .string()
      .optional()
      .describe("Cursor for next page"),
    includeComputedMetrics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include computed CPA, ROAS, CPM, CTR, CPC derived from raw metrics"),
  })
  .merge(ReportViewInputSchema)
  .describe("Parameters for getting Meta Ads insights");

export const GetInsightsOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    nextCursor: z.string().optional().describe("Cursor for next page"),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    summary: z.record(z.any()).optional().describe("Summary statistics"),
    totalCount: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Insights query result");

type GetInsightsInput = z.infer<typeof GetInsightsInputSchema>;
type GetInsightsOutput = z.infer<typeof GetInsightsOutputSchema>;

export async function getInsightsLogic(
  input: GetInsightsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetInsightsOutput> {
  const { metaInsightsService } = resolveSessionServices(sdkContext);
  const viewInput = input.maxRows === undefined && input.limit !== undefined
    ? { ...input, maxRows: input.limit }
    : input;

  const result = await metaInsightsService.getInsights(
    input.entityId,
    {
      fields: input.fields,
      datePreset: input.datePreset,
      timeRange: input.timeRange,
      timeIncrement: input.timeIncrement,
      level: input.level,
      limit: getReportViewFetchLimit(viewInput),
      after: input.after,
    },
    context
  );

  let rows = result.data as Record<string, unknown>[];
  if (input.includeComputedMetrics) {
    rows = rows.map((row) => {
      const cost = Number(row.spend || 0);
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      // Filter to true conversion action types; the actions array also contains
      // engagement/click actions that must not be counted as conversions.
      const isConversionAction = (actionType: string) =>
        actionType.startsWith("offsite_conversion") ||
        actionType === "purchase" ||
        actionType === "complete_registration" ||
        actionType === "lead";
      const conversions = Array.isArray(row.actions)
        ? (row.actions as Array<{ action_type?: string; value?: unknown }>)
            .filter((a) => isConversionAction(a.action_type ?? ""))
            .reduce((sum, a) => sum + Number(a.value || 0), 0)
        : 0;
      const conversionValue = Array.isArray(row.action_values)
        ? (row.action_values as Array<{ action_type?: string; value?: unknown }>)
            .filter((a) => isConversionAction(a.action_type ?? ""))
            .reduce((sum, a) => sum + Number(a.value || 0), 0)
        : 0;
      return { ...row, computedMetrics: computeMetrics({ cost, impressions, clicks, conversions, conversionValue }) };
    });
  }

  return {
    ...createReportView({
      rows,
      totalRows: rows.length + (result.nextCursor ? 1 : 0),
      input: viewInput,
      warnings: result.nextCursor ? ["More rows are available. Call again with after set to nextCursor to continue."] : [],
    }),
    nextCursor: result.nextCursor,
    has_more: !!result.nextCursor,
    summary: result.summary as Record<string, unknown> | undefined,
    totalCount: rows.length,
    timestamp: new Date().toISOString(),
  };
}

export function getInsightsResponseFormatter(result: GetInsightsOutput): McpTextContent[] {
  const summary = `Retrieved ${result.returnedRows} insight row(s)`;
  const pagination = result.nextCursor
    ? `\n\nMore results available. Use after: "${result.nextCursor}"`
    : "";

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${formatReportViewResponse(result, "Insight data")}${pagination}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getInsightsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetInsightsInputSchema,
  outputSchema: GetInsightsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get last 7 days insights for a campaign",
      input: {
        entityId: "23456789012345",
        datePreset: "last_7d",
      },
    },
    {
      label: "Get daily insights with custom date range",
      input: {
        entityId: "act_123456789",
        fields: ["impressions", "clicks", "spend", "cpc", "ctr"],
        timeRange: { since: "2026-01-01", until: "2026-01-31" },
        timeIncrement: "1",
        level: "campaign",
      },
    },
  ],
  logic: getInsightsLogic,
  responseFormatter: getInsightsResponseFormatter,
};
