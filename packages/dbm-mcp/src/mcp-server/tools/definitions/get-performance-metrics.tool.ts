import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const getPerformanceMetricsTool: Tool = {
  name: "get_performance_metrics",
  description:
    "Calculate performance metrics (CPM, CTR, CPA, ROAS) for a campaign within a date range",
  inputSchema: {
    type: "object",
    properties: {
      campaignId: {
        type: "string",
        description: "The campaign ID to calculate metrics for",
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

export const getPerformanceMetricsParamsSchema = z.object({
  campaignId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetPerformanceMetricsParams = z.infer<typeof getPerformanceMetricsParamsSchema>;

export async function handleGetPerformanceMetrics(params: GetPerformanceMetricsParams) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            campaignId: params.campaignId,
            dateRange: { startDate: params.startDate, endDate: params.endDate },
            performance: {
              cpm: 10.0,
              ctr: 0.5,
              cpc: 2.0,
              cpa: 200.0,
              roas: 1.5,
              conversionRate: 1.0,
            },
            message: "Stub implementation - actual performance calculations pending",
          },
          null,
          2
        ),
      },
    ],
    isError: false,
  };
}
