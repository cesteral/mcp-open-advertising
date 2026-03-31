// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { computeMetrics, resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
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
    pivot: z
      .string()
      .optional()
      .describe("Dimension to pivot on (default: CAMPAIGN)"),
    timeGranularity: z
      .enum(["DAILY", "MONTHLY", "YEARLY", "ALL"])
      .optional()
      .describe("Time granularity (default: DAILY)"),
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
  .describe("Parameters for getting LinkedIn Ads analytics");

export const GetAnalyticsOutputSchema = z
  .object({
    elements: z.array(z.record(z.any())).describe("Analytics data rows"),
    pivot: z.string().describe("Pivot dimension used"),
    timeGranularity: z.string(),
    dateRange: z.object({
      start: z.string(),
      end: z.string(),
    }),
    count: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("Analytics result");

type GetAnalyticsInput = z.infer<typeof GetAnalyticsInputSchema>;
type GetAnalyticsOutput = z.infer<typeof GetAnalyticsOutputSchema>;

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

  let elements = result.elements as Record<string, unknown>[];

  if (input.includeComputedMetrics) {
    elements = elements.map((row) => {
      const cost = Number((row as Record<string, unknown>).costInUsd || 0);
      const impressions = Number((row as Record<string, unknown>).impressions || 0);
      const clicks = Number((row as Record<string, unknown>).clicks || 0);
      const conversions = Number((row as Record<string, unknown>).conversions || 0);
      const computedMetrics = computeMetrics({ cost, impressions, clicks, conversions, conversionValue: 0 });
      return { ...row, computedMetrics };
    });
  }

  return {
    elements,
    pivot: input.pivot ?? "CAMPAIGN",
    timeGranularity: input.timeGranularity ?? "DAILY",
    dateRange: { start: resolvedStartDate!, end: resolvedEndDate! },
    count: elements.length,
    timestamp: new Date().toISOString(),
  };
}

export function getAnalyticsResponseFormatter(result: GetAnalyticsOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Analytics (${result.pivot}, ${result.timeGranularity})\nDate range: ${result.dateRange.start} to ${result.dateRange.end}\n${result.count} rows returned\n\n${JSON.stringify(result.elements, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
