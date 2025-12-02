import { z } from "zod";
import type { RequestContext } from "../../../utils/internal/request-context.js";
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
  _sdkContext?: SdkContext
): Promise<GetPerformanceMetricsOutput> {
  // TODO: Implement actual calculations from Bid Manager report data
  // This is a stub that returns mock data
  const delivery = {
    impressions: 1000000,
    clicks: 5000,
    spend: 10000.0,
    conversions: 50,
    revenue: 15000.0,
  };

  return {
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    dateRange: {
      startDate: input.startDate,
      endDate: input.endDate,
    },
    delivery,
    performance: {
      cpm: delivery.impressions > 0 ? (delivery.spend / delivery.impressions) * 1000 : 0,
      ctr: delivery.impressions > 0 ? (delivery.clicks / delivery.impressions) * 100 : 0,
      cpc: delivery.clicks > 0 ? delivery.spend / delivery.clicks : 0,
      cpa: delivery.conversions > 0 ? delivery.spend / delivery.conversions : 0,
      roas: delivery.spend > 0 ? delivery.revenue / delivery.spend : 0,
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
• Revenue: $${result.delivery.revenue.toFixed(2)}

Full Data:
${JSON.stringify(result, null, 2)}`,
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
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: getPerformanceMetricsLogic,
  responseFormatter: getPerformanceMetricsResponseFormatter,
};
