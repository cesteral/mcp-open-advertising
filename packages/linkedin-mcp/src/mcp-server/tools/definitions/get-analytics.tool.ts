// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  appendComputedMetricsToRows,
  ComputedMetricsFlagSchema,
  createReportView,
  DATE_PRESET_VALUES,
  formatReportViewResponse,
  ReportViewInputSchema,
  ReportViewOutputSchema,
  resolveDatePreset,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_analytics";
const TOOL_TITLE = "Get LinkedIn Ads Analytics";
const TOOL_DESCRIPTION = `Get analytics metrics for a LinkedIn Ads account.

Uses the LinkedIn /v2/adAnalytics endpoint with offset-based date ranges.

**Available pivots:** CAMPAIGN, CAMPAIGN_GROUP, CREATIVE, MEMBER_COMPANY_SIZE,
MEMBER_INDUSTRY, MEMBER_SENIORITY, MEMBER_JOB_TITLE, MEMBER_JOB_FUNCTION,
MEMBER_COUNTRY, MEMBER_REGION

**Available metrics:** impressions, clicks, costInUsd, conversions,
externalWebsiteConversions, leadGenerationMailContactInfoShares, oneClickLeads,
videoViews, videoCompletions, videoFirstQuartileCompletions,
videoMidpointCompletions, videoThirdQuartileCompletions

**timeGranularity values:** DAILY, MONTHLY, YEARLY, ALL`;

export const GetAnalyticsInputSchema = z
  .object({
    adAccountUrn: z
      .string()
      .min(1)
      .describe("The ad account URN (e.g., urn:li:sponsoredAccount:123)"),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Use this OR startDate+endDate (not both)"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .optional()
      .describe("Start date in YYYY-MM-DD format (required if datePreset not provided)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .optional()
      .describe("End date in YYYY-MM-DD format (required if datePreset not provided)"),
    metrics: z
      .array(z.string())
      .optional()
      .describe("Metrics to retrieve (defaults to impressions, clicks, costInUsd, conversions)"),
    pivot: z.string().optional().describe("Dimension to pivot on (default: CAMPAIGN)"),
    timeGranularity: z
      .enum(["DAILY", "MONTHLY", "YEARLY", "ALL"])
      .optional()
      .describe("Time granularity (default: DAILY)"),
  })
  .merge(ReportViewInputSchema)
  .merge(ComputedMetricsFlagSchema)
  .refine(
    (data) =>
      data.datePreset !== undefined || (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Provide either datePreset or both startDate and endDate" }
  )
  .describe("Parameters for getting LinkedIn Ads analytics");

export const GetAnalyticsOutputSchema = ReportViewOutputSchema.extend({
  pivot: z.string().describe("Pivot dimension used"),
  timeGranularity: z.string(),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }),
  timestamp: z.string().datetime(),
}).describe("Analytics result");

type GetAnalyticsInput = z.infer<typeof GetAnalyticsInputSchema>;
type GetAnalyticsOutput = z.infer<typeof GetAnalyticsOutputSchema>;

const LINKEDIN_COMPUTED_METRIC_ALIASES = {
  cost: ["costInUsd", "costInLocalCurrency"],
  impressions: ["impressions"],
  clicks: ["clicks"],
  conversions: ["externalWebsiteConversions", "conversions", "oneClickLeads"],
  conversionValue: ["conversionValueInLocalCurrency"],
};

export async function getAnalyticsLogic(
  input: GetAnalyticsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAnalyticsOutput> {
  const { linkedInReportingService } = resolveSessionServices(sdkContext);

  let resolvedStartDate = input.startDate;
  let resolvedEndDate = input.endDate;
  if (input.datePreset) {
    const resolved = resolveDatePreset(input.datePreset);
    resolvedStartDate = resolved.startDate;
    resolvedEndDate = resolved.endDate;
  }

  const result = await linkedInReportingService.getAnalytics(
    input.adAccountUrn,
    { start: resolvedStartDate!, end: resolvedEndDate! },
    input.metrics,
    input.pivot,
    input.timeGranularity,
    context
  );

  // LinkedIn returns a flat JSON element array. Stringify field values so the
  // bounded-view + computed-metrics helpers (which both expect string-valued
  // records) can work on the same shape.
  const rawElements = result.elements as Record<string, unknown>[];
  const stringRows: Record<string, string>[] = rawElements.map((row) => {
    const record: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      record[k] = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
    }
    return record;
  });

  const augmented = input.includeComputedMetrics
    ? appendComputedMetricsToRows(stringRows, LINKEDIN_COMPUTED_METRIC_ALIASES)
    : stringRows;
  const computedWarning = input.includeComputedMetrics
    ? augmented[0]?._computedMetricsWarnings
    : undefined;

  const view = createReportView({
    rows: augmented,
    totalRows: augmented.length,
    input,
    warnings: computedWarning ? [`computed metrics: ${computedWarning}`] : undefined,
  });

  return {
    ...view,
    pivot: input.pivot ?? "CAMPAIGN",
    timeGranularity: input.timeGranularity ?? "DAILY",
    dateRange: { start: resolvedStartDate!, end: resolvedEndDate! },
    timestamp: new Date().toISOString(),
  };
}

export function getAnalyticsResponseFormatter(result: GetAnalyticsOutput): McpTextContent[] {
  const header = `Analytics (${result.pivot}, ${result.timeGranularity})\nDate range: ${result.dateRange.start} to ${result.dateRange.end}`;
  return [
    {
      type: "text" as const,
      text: `${header}\n\n${formatReportViewResponse(result, "Rows")}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getAnalyticsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAnalyticsInputSchema,
  outputSchema: GetAnalyticsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get last 30 days campaign impressions and clicks",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        datePreset: "LAST_30_DAYS",
        metrics: ["impressions", "clicks", "costInUsd"],
        pivot: "CAMPAIGN",
        timeGranularity: "DAILY",
      },
    },
    {
      label: "Get monthly summary by campaign group",
      input: {
        adAccountUrn: "urn:li:sponsoredAccount:123456789",
        startDate: "2026-01-01",
        endDate: "2026-03-01",
        pivot: "CAMPAIGN_GROUP",
        timeGranularity: "MONTHLY",
      },
    },
  ],
  logic: getAnalyticsLogic,
  responseFormatter: getAnalyticsResponseFormatter,
};
