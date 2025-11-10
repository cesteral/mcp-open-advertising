import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const getHistoricalMetricsTool: Tool = {
  name: "get_historical_metrics",
  description: "Fetch time-series historical metrics for trend analysis",
  inputSchema: {
    type: "object",
    properties: {
      campaignId: {
        type: "string",
        description: "The campaign ID to fetch historical data for",
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
      granularity: {
        type: "string",
        enum: ["daily", "hourly"],
        description: "Time series granularity (default: daily)",
      },
    },
    required: ["campaignId", "startDate", "endDate"],
  },
};

export const getHistoricalMetricsParamsSchema = z.object({
  campaignId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(["daily", "hourly"]).default("daily"),
});

export type GetHistoricalMetricsParams = z.infer<typeof getHistoricalMetricsParamsSchema>;

export async function handleGetHistoricalMetrics(params: GetHistoricalMetricsParams) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            campaignId: params.campaignId,
            dateRange: { startDate: params.startDate, endDate: params.endDate },
            granularity: params.granularity,
            timeSeries: [
              {
                date: params.startDate,
                metrics: {
                  impressions: 100000,
                  clicks: 500,
                  spend: 1000,
                  conversions: 5,
                },
              },
            ],
            message: "Stub implementation - actual time-series data pending",
          },
          null,
          2
        ),
      },
    ],
    isError: false,
  };
}
