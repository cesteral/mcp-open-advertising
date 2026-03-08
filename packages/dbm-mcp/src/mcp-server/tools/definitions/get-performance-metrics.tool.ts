import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";

const TOOL_NAME = "get_performance_metrics";
const TOOL_TITLE = "Get Performance Metrics";
const TOOL_DESCRIPTION =
  "Calculate performance metrics (CPM, CTR, CPA, ROAS) for a campaign within a date range";

/**
 * Input schema
 */
export const GetPerformanceMetricsInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("DV360 Advertiser ID"),
    campaignId: z.string().min(1).describe("The campaign ID to calculate metrics for"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Start date in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("End date in YYYY-MM-DD format"),
  })
  .describe("Parameters for calculating performance metrics");

/**
 * Output schema
 */
export const GetPerformanceMetricsOutputSchema = z
  .object({
    advertiserId: z.string(),
    campaignId: z.string(),
    dateRange: z.object({
      startDate: z.string(),
      endDate: z.string(),
    }),
    delivery: z.object({
      impressions: z.number(),
      clicks: z.number(),
      spend: z.number(),
      conversions: z.number(),
      revenue: z.number(),
    }),
    performance: z.object({
      cpm: z.number().describe("Cost per mille (spend / impressions * 1000)"),
      ctr: z.number().describe("Click-through rate (clicks / impressions * 100)"),
      cpc: z.number().describe("Cost per click (spend / clicks)"),
      cpa: z.number().describe("Cost per acquisition (spend / conversions)"),
      roas: z.number().describe("Return on ad spend (revenue / spend)"),
    }),
    timestamp: z.string().datetime(),
  })
  .describe("Performance metrics result");

export type GetPerformanceMetricsInput = z.infer<typeof GetPerformanceMetricsInputSchema>;
export type GetPerformanceMetricsOutput = z.infer<typeof GetPerformanceMetricsOutputSchema>;

/**
 * Tool logic
 */
export async function getPerformanceMetricsLogic(
  input: GetPerformanceMetricsInput,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetPerformanceMetricsOutput> {
  // Resolve services for this session
  const { bidManagerService } = resolveSessionServices(sdkContext);

  // Fetch performance metrics (includes calculated KPIs)
  const metrics = await bidManagerService.getPerformanceMetrics({
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return {
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    dateRange: {
      startDate: input.startDate,
      endDate: input.endDate,
    },
    delivery: {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      conversions: metrics.conversions,
      revenue: metrics.revenue,
    },
    performance: {
      cpm: metrics.cpm,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpa: metrics.cpa,
      roas: metrics.roas,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Response formatter
 */
export function getPerformanceMetricsResponseFormatter(
  result: GetPerformanceMetricsOutput,
  input: GetPerformanceMetricsInput
): any[] {
  return [
    {
      type: "text" as const,
      text: `Campaign ${input.campaignId} Performance (${input.startDate} to ${input.endDate}):

📈 Performance Metrics:
• CPM: $${result.performance.cpm.toFixed(2)}
• CTR: ${result.performance.ctr.toFixed(2)}%
• CPC: $${result.performance.cpc.toFixed(2)}
• CPA: $${result.performance.cpa.toFixed(2)}
• ROAS: ${result.performance.roas.toFixed(2)}x

📊 Base Delivery:
• Impressions: ${result.delivery.impressions.toLocaleString()}
• Clicks: ${result.delivery.clicks.toLocaleString()}
• Spend: $${result.delivery.spend.toFixed(2)}
• Conversions: ${result.delivery.conversions}
• Revenue: $${result.delivery.revenue.toFixed(2)}`,
    },
  ];
}

/**
 * Tool definition (rich pattern)
 */
export const getPerformanceMetricsTool: ToolDefinition<
  typeof GetPerformanceMetricsInputSchema,
  typeof GetPerformanceMetricsOutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetPerformanceMetricsInputSchema,
  outputSchema: GetPerformanceMetricsOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Calculate KPIs for a campaign over the past month",
      input: {
        advertiserId: "1234567",
        campaignId: "9876543",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    },
    {
      label: "Evaluate performance over a short campaign flight",
      input: {
        advertiserId: "7654321",
        campaignId: "1122334",
        startDate: "2026-02-01",
        endDate: "2026-02-14",
      },
    },
    {
      label: "Annual performance review for a large campaign",
      input: {
        advertiserId: "9988776",
        campaignId: "5544332",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      },
    },
  ],
  logic: getPerformanceMetricsLogic,
  responseFormatter: getPerformanceMetricsResponseFormatter,
};
