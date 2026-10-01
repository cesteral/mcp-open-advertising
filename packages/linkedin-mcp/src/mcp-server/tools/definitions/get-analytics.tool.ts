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
  buildMetricContext,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import {
  ANALYTICS_MAX_FIELDS,
  LINKEDIN_ANALYTICS_PIVOTS,
  analyticsTruncationWarning,
} from "../../../services/linkedin/analytics-fields.js";

const TOOL_NAME = "linkedin_get_analytics";
const TOOL_TITLE = "Get LinkedIn Ads Analytics";
const TOOL_DESCRIPTION = `Get analytics metrics for a LinkedIn Ads account.

Uses LinkedIn's \`/rest/adAnalytics\` \`analytics\` finder: one pivot, one date range, one time granularity.

**Pivots:** ${LINKEDIN_ANALYTICS_PIVOTS.join(", ")}. The geo pivots are MEMBER_COUNTRY_V2 and MEMBER_REGION_V2.

**Metrics** (LinkedIn's field names): impressions, clicks, costInUsd, costInLocalCurrency,
externalWebsiteConversions, externalWebsitePostClickConversions, externalWebsitePostViewConversions,
leadGenerationMailContactInfoShares, oneClickLeads, videoViews, videoStarts, videoCompletions,
videoFirstQuartileCompletions, videoMidpointCompletions, videoThirdQuartileCompletions,
likes, comments, shares, follows, totalEngagements, landingPageClicks, conversionValueInLocalCurrency,
approximateMemberReach (non-demographic pivots, date ranges of 92 days or less).
There are no \`conversions\`, \`reach\`, \`frequency\`, CTR or cost-per-conversion fields; set
\`includeComputedMetrics\` for CTR, CPC, CPM, CPA and ROAS.

**Fields.** With no \`metrics\`, a default set is requested. \`dateRange\` and \`pivotValues\` are added so each row says which date and pivot value it belongs to. LinkedIn allows at most ${ANALYTICS_MAX_FIELDS} fields, and those two count, so pass at most ${ANALYTICS_MAX_FIELDS - 2} metrics.

**timeGranularity values:** DAILY, MONTHLY, YEARLY, ALL. With ALL, a range that reaches outside the 6-month daily-retention window is rounded to whole months.

**Limits (LinkedIn):** the endpoint is not paginated and returns at most 15,000 rows; a warning is added when that many come back. Demographic (MEMBER_*) pivots return only the top 100 values per creative per day, drop values with fewer than 3 events, and exclude conversionValueInLocalCurrency and approximateMemberReach. Demographic metrics can lag 12 to 24 hours.`;

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
      .max(ANALYTICS_MAX_FIELDS)
      .optional()
      .describe(
        `LinkedIn metric names (defaults to impressions, clicks, costInUsd, costInLocalCurrency, externalWebsiteConversions, leadGenerationMailContactInfoShares, oneClickLeads). dateRange and pivotValues are added and count toward LinkedIn's limit of ${ANALYTICS_MAX_FIELDS} fields, so pass at most ${ANALYTICS_MAX_FIELDS - 2}`
      ),
    pivot: z
      .enum(LINKEDIN_ANALYTICS_PIVOTS)
      .optional()
      .describe(
        "Dimension to pivot on (default: CAMPAIGN). Geo pivots are MEMBER_COUNTRY_V2 / MEMBER_REGION_V2"
      ),
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
  conversions: ["externalWebsiteConversions", "oneClickLeads"],
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

  const truncationWarning = analyticsTruncationWarning(rawElements.length);

  const augmented = input.includeComputedMetrics
    ? appendComputedMetricsToRows(stringRows, LINKEDIN_COMPUTED_METRIC_ALIASES)
    : stringRows;
  const computedWarning = input.includeComputedMetrics
    ? augmented[0]?._computedMetricsWarnings
    : undefined;

  const warnings = [
    ...(computedWarning ? [`computed metrics: ${computedWarning}`] : []),
    ...(truncationWarning ? [truncationWarning] : []),
  ];

  const view = createReportView({
    rows: augmented,
    totalRows: augmented.length,
    input,
    warnings: warnings.length > 0 ? warnings : undefined,
    // Preset already resolved to concrete dates above, so the window is known
    // even when the caller passed a preset.
    metricContext: buildMetricContext({
      source: "linkedin_ads",
      dateRange: { start: resolvedStartDate, end: resolvedEndDate },
    }),
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
  untrustedContent: {
    structuredPaths: ["$.headers", "$.selectedColumns", "$.rows", "$.previewRows", "$.warnings"],
    contentBlocks: [0],
  },
};
