import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";

const TOOL_NAME = "get_historical_metrics";
const TOOL_TITLE = "Get Historical Metrics";
const TOOL_DESCRIPTION = "Fetch time-series historical metrics for trend analysis";

/**
 * Input schema
 */
export const GetHistoricalMetricsInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("DV360 Advertiser ID"),
    campaignId: z.string().min(1).describe("The campaign ID to fetch historical data for"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Start date in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("End date in YYYY-MM-DD format"),
    granularity: z
      .enum(["daily", "weekly", "monthly"])
      .default("daily")
      .describe("Time series granularity (default: daily)"),
  })
  .describe("Parameters for fetching historical metrics");

/**
 * Output schema
 */
export const GetHistoricalMetricsOutputSchema = z
  .object({
    advertiserId: z.string(),
    campaignId: z.string(),
    dateRange: z.object({
      startDate: z.string(),
      endDate: z.string(),
    }),
    granularity: z.enum(["daily", "weekly", "monthly"]),
    timeSeries: z.array(
      z.object({
        date: z.string(),
        metrics: z.object({
          impressions: z.number(),
          clicks: z.number(),
          spend: z.number(),
          conversions: z.number(),
          revenue: z.number(),
        }),
      })
    ),
    summary: z.object({
      totalImpressions: z.number(),
      totalClicks: z.number(),
      totalSpend: z.number(),
      totalConversions: z.number(),
      dataPoints: z.number(),
    }),
    timestamp: z.string().datetime(),
  })
  .describe("Historical metrics time-series result");

export type GetHistoricalMetricsInput = z.infer<typeof GetHistoricalMetricsInputSchema>;
export type GetHistoricalMetricsOutput = z.infer<typeof GetHistoricalMetricsOutputSchema>;

/**
 * Tool logic
 */
export async function getHistoricalMetricsLogic(
  input: GetHistoricalMetricsInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetHistoricalMetricsOutput> {
  // Resolve services for this session
  const { bidManagerService } = resolveSessionServices(sdkContext);

  // Fetch historical metrics via Bid Manager API
  const historicalData = await bidManagerService.getHistoricalMetrics({
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    startDate: input.startDate,
    endDate: input.endDate,
    granularity: input.granularity,
  });

  // Transform to output format
  const timeSeries = historicalData.map((point) => ({
    date: point.date,
    metrics: {
      impressions: point.metrics.impressions,
      clicks: point.metrics.clicks,
      spend: point.metrics.spend,
      conversions: point.metrics.conversions,
      revenue: point.metrics.revenue,
    },
  }));

  // Calculate summary
  const summary = timeSeries.reduce(
    (acc, point) => ({
      totalImpressions: acc.totalImpressions + point.metrics.impressions,
      totalClicks: acc.totalClicks + point.metrics.clicks,
      totalSpend: acc.totalSpend + point.metrics.spend,
      totalConversions: acc.totalConversions + point.metrics.conversions,
      dataPoints: acc.dataPoints + 1,
    }),
    { totalImpressions: 0, totalClicks: 0, totalSpend: 0, totalConversions: 0, dataPoints: 0 }
  );

  return {
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    dateRange: {
      startDate: input.startDate,
      endDate: input.endDate,
    },
    granularity: input.granularity,
    timeSeries,
    summary,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Response formatter
 */
export function getHistoricalMetricsResponseFormatter(
  result: GetHistoricalMetricsOutput,
  input: GetHistoricalMetricsInput
): any[] {
  const trendsText = result.timeSeries
    .slice(0, 5)
    .map(
      (point) =>
        `  ${point.date}: ${point.metrics.impressions.toLocaleString()} impr, $${point.metrics.spend.toFixed(2)} spend`
    )
    .join("\n");

  return [
    {
      type: "text" as const,
      text: `Campaign ${input.campaignId} Historical Metrics (${input.startDate} to ${input.endDate}):

📈 Summary (${result.summary.dataPoints} data points, ${result.granularity}):
• Total Impressions: ${result.summary.totalImpressions.toLocaleString()}
• Total Clicks: ${result.summary.totalClicks.toLocaleString()}
• Total Spend: $${result.summary.totalSpend.toFixed(2)}
• Total Conversions: ${result.summary.totalConversions}

📊 Trend (first 5 periods):
${trendsText}`,
    },
  ];
}

/**
 * Tool definition (rich pattern)
 */
export const getHistoricalMetricsTool: ToolDefinition<
  typeof GetHistoricalMetricsInputSchema,
  typeof GetHistoricalMetricsOutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetHistoricalMetricsInputSchema,
  outputSchema: GetHistoricalMetricsOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Daily trend over the past 30 days",
      input: {
        advertiserId: "1234567",
        campaignId: "9876543",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        granularity: "daily",
      },
    },
    {
      label: "Weekly trend over a quarter",
      input: {
        advertiserId: "7654321",
        campaignId: "1122334",
        startDate: "2025-10-01",
        endDate: "2025-12-31",
        granularity: "weekly",
      },
    },
    {
      label: "Monthly trend over a full year",
      input: {
        advertiserId: "9988776",
        campaignId: "5544332",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        granularity: "monthly",
      },
    },
  ],
  logic: getHistoricalMetricsLogic,
  responseFormatter: getHistoricalMetricsResponseFormatter,
};
