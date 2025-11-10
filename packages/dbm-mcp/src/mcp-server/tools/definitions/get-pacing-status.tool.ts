import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const getPacingStatusTool: Tool = {
  name: "get_pacing_status",
  description: "Get real-time pacing status for a campaign (actual vs expected delivery)",
  inputSchema: {
    type: "object",
    properties: {
      campaignId: {
        type: "string",
        description: "The campaign ID to check pacing for",
      },
    },
    required: ["campaignId"],
  },
};

export const getPacingStatusParamsSchema = z.object({
  campaignId: z.string().min(1),
});

export type GetPacingStatusParams = z.infer<typeof getPacingStatusParamsSchema>;

export async function handleGetPacingStatus(params: GetPacingStatusParams) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            campaignId: params.campaignId,
            campaignName: "Example Campaign",
            budget: 100000,
            spend: 45000,
            flightStartDate: "2025-01-01",
            flightEndDate: "2025-12-31",
            daysElapsed: 150,
            totalDays: 365,
            expectedSpend: 41096,
            pacingPercent: 109.5,
            pacingOffset: 9.5,
            isPacingCorrect: false,
            deliveryStatus: "overpacing",
            message: "Stub implementation - actual pacing calculations pending",
          },
          null,
          2
        ),
      },
    ],
    isError: false,
  };
}
