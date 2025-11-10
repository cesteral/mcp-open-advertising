import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool definition for get_campaign_delivery
 */
export const getCampaignDeliveryTool: Tool = {
  name: "get_campaign_delivery",
  description:
    "Fetch delivery metrics (impressions, clicks, spend, conversions) for a campaign within a date range",
  inputSchema: {
    type: "object",
    properties: {
      campaignId: {
        type: "string",
        description: "The campaign ID to fetch delivery metrics for",
      },
      startDate: {
        type: "string",
        description: "Start date in YYYY-MM-DD format",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      endDate: {
        type: "string",
        description: "End date in YYYY-MM-DD format",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
    required: ["campaignId", "startDate", "endDate"],
  },
};

/**
 * Zod schema for validation
 */
export const getCampaignDeliveryParamsSchema = z.object({
  campaignId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
});

export type GetCampaignDeliveryParams = z.infer<typeof getCampaignDeliveryParamsSchema>;

/**
 * Handler function (stub implementation)
 */
export async function handleGetCampaignDelivery(params: GetCampaignDeliveryParams) {
  // TODO: Implement actual BigQuery query via DeliveryService
  // This is a stub that returns mock data
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            campaignId: params.campaignId,
            dateRange: {
              startDate: params.startDate,
              endDate: params.endDate,
            },
            metrics: {
              impressions: 1000000,
              clicks: 5000,
              spend: 10000.0,
              conversions: 50,
              revenue: 15000.0,
            },
            message: "Stub implementation - actual BigQuery integration pending",
          },
          null,
          2
        ),
      },
    ],
    isError: false,
  };
}
