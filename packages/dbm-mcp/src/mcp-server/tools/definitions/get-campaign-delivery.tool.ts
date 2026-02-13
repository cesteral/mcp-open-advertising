import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";
import { calculateCTR, calculateCPM, formatMetricValue } from "../../../utils/metrics.js";

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
  sdkContext?: SdkContext
): Promise<GetCampaignDeliveryOutput> {
  // Resolve BidManagerService from DI container
  const { bidManagerService } = resolveSessionServices(sdkContext);

  // Fetch delivery metrics via Bid Manager API
  const metrics = await bidManagerService.getDeliveryMetrics({
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
    metrics: {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      conversions: metrics.conversions,
      revenue: metrics.revenue,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Response formatter
 *
 * Uses declarative metrics utilities for consistent calculation.
 */
export function getCampaignDeliveryResponseFormatter(
  result: GetCampaignDeliveryOutput,
  input: GetCampaignDeliveryInput
): any[] {
  // Use declarative metrics utilities instead of inline calculations
  const ctr = calculateCTR(result.metrics.clicks, result.metrics.impressions);
  const cpm = calculateCPM(result.metrics.spend, result.metrics.impressions);

  return [
    {
      type: "text" as const,
      text: `Campaign ${input.campaignId} Delivery (${input.startDate} to ${input.endDate}):

Delivery Metrics:
- Impressions: ${result.metrics.impressions.toLocaleString()}
- Clicks: ${result.metrics.clicks.toLocaleString()}
- CTR: ${formatMetricValue("ctr", ctr)}
- Spend: $${result.metrics.spend.toFixed(2)}
- CPM: ${formatMetricValue("cpm", cpm)}
- Conversions: ${result.metrics.conversions}
- Revenue: $${result.metrics.revenue.toFixed(2)}
`,
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
