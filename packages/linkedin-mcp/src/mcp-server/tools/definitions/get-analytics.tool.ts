import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

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
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Start date in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("End date in YYYY-MM-DD format"),
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
  })
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

  const result = await linkedInReportingService.getAnalytics(
    input.adAccountUrn,
    { start: input.startDate, end: input.endDate },
    input.metrics,
    input.pivot,
    input.timeGranularity,
    context
  );

  return {
    elements: result.elements as Record<string, unknown>[],
    pivot: input.pivot ?? "CAMPAIGN",
    timeGranularity: input.timeGranularity ?? "DAILY",
    dateRange: { start: input.startDate, end: input.endDate },
    count: result.elements.length,
    timestamp: new Date().toISOString(),
  };
}

export function getAnalyticsResponseFormatter(result: GetAnalyticsOutput): unknown[] {
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
        startDate: "2026-02-01",
        endDate: "2026-03-01",
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
