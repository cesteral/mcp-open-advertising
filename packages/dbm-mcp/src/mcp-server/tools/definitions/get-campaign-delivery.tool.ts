import { z } from "zod";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";

const TOOL_NAME = "get_campaign_delivery";
const TOOL_TITLE = "Get Campaign Delivery";
const TOOL_DESCRIPTION =
  "Fetch DV360 delivery metrics (impressions, clicks, spend, conversions) for a campaign within a date range via Bid Manager API";

/**
 * Input schema
 */
export const GetCampaignDeliveryInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("DV360 Advertiser ID"),
    campaignId: z.string().min(1).describe("DV360 Campaign ID to fetch delivery metrics for"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Start date in YYYY-MM-DD format"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("End date in YYYY-MM-DD format"),
  })
  .describe("Parameters for fetching campaign delivery metrics");

/**
 * Output schema
 */
export const GetCampaignDeliveryOutputSchema = z
  .object({
    advertiserId: z.string(),
    campaignId: z.string(),
    dateRange: z.object({
      startDate: z.string(),
      endDate: z.string(),
    }),
    metrics: z.object({
      impressions: z.number(),
      clicks: z.number(),
      spend: z.number(),
      conversions: z.number(),
      revenue: z.number(),
    }),
    timestamp: z.string().datetime(),
  })
  .describe("Campaign delivery metrics result");

export type GetCampaignDeliveryInput = z.infer<typeof GetCampaignDeliveryInputSchema>;
export type GetCampaignDeliveryOutput = z.infer<typeof GetCampaignDeliveryOutputSchema>;

/**
 * Tool logic
 */
export async function getCampaignDeliveryLogic(
  input: GetCampaignDeliveryInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<GetCampaignDeliveryOutput> {
  // TODO: Implement actual Bid Manager API v2 query via BidManagerService
  // This is a stub that returns mock data
  return {
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    dateRange: {
      startDate: input.startDate,
      endDate: input.endDate,
    },
    metrics: {
      impressions: 1000000,
      clicks: 5000,
      spend: 10000.0,
      conversions: 50,
      revenue: 15000.0,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Response formatter
 */
export function getCampaignDeliveryResponseFormatter(
  result: GetCampaignDeliveryOutput,
  input: GetCampaignDeliveryInput
): any[] {
  const ctr = result.metrics.impressions > 0
    ? ((result.metrics.clicks / result.metrics.impressions) * 100).toFixed(2)
    : "0.00";
  const cpm = result.metrics.impressions > 0
    ? ((result.metrics.spend / result.metrics.impressions) * 1000).toFixed(2)
    : "0.00";

  return [
    {
      type: "text" as const,
      text: `Campaign ${input.campaignId} Delivery (${input.startDate} to ${input.endDate}):

📊 Delivery Metrics:
• Impressions: ${result.metrics.impressions.toLocaleString()}
• Clicks: ${result.metrics.clicks.toLocaleString()}
• CTR: ${ctr}%
• Spend: $${result.metrics.spend.toFixed(2)}
• CPM: $${cpm}
• Conversions: ${result.metrics.conversions}
• Revenue: $${result.metrics.revenue.toFixed(2)}

Full Data:
${JSON.stringify(result, null, 2)}`,
    },
  ];
}

/**
 * Tool definition (rich pattern)
 */
export const getCampaignDeliveryTool: ToolDefinition<
  typeof GetCampaignDeliveryInputSchema,
  typeof GetCampaignDeliveryOutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetCampaignDeliveryInputSchema,
  outputSchema: GetCampaignDeliveryOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: getCampaignDeliveryLogic,
  responseFormatter: getCampaignDeliveryResponseFormatter,
};
