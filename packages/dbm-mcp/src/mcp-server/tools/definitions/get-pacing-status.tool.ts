import { z } from "zod";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";

const TOOL_NAME = "get_pacing_status";
const TOOL_TITLE = "Get Pacing Status";
const TOOL_DESCRIPTION =
  "Get real-time pacing status for a campaign (actual vs expected delivery)";

/**
 * Input schema
 */
export const GetPacingStatusInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("DV360 Advertiser ID"),
    campaignId: z.string().min(1).describe("The campaign ID to check pacing for"),
  })
  .describe("Parameters for checking campaign pacing status");

/**
 * Output schema
 */
export const GetPacingStatusOutputSchema = z
  .object({
    advertiserId: z.string(),
    campaignId: z.string(),
    campaignName: z.string(),
    budget: z.object({
      total: z.number(),
      spent: z.number(),
      remaining: z.number(),
      currency: z.string(),
    }),
    flight: z.object({
      startDate: z.string(),
      endDate: z.string(),
      daysElapsed: z.number(),
      daysRemaining: z.number(),
      totalDays: z.number(),
    }),
    pacing: z.object({
      expectedSpendPercent: z.number(),
      actualSpendPercent: z.number(),
      pacingRatio: z.number().describe("actual / expected (1.0 = on pace)"),
      status: z.enum(["ON_PACE", "AHEAD", "BEHIND", "SEVERELY_BEHIND"]),
      projectedEndSpend: z.number(),
    }),
    timestamp: z.string().datetime(),
  })
  .describe("Campaign pacing status result");

export type GetPacingStatusInput = z.infer<typeof GetPacingStatusInputSchema>;
export type GetPacingStatusOutput = z.infer<typeof GetPacingStatusOutputSchema>;

/**
 * Tool logic
 */
export async function getPacingStatusLogic(
  input: GetPacingStatusInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<GetPacingStatusOutput> {
  // TODO: Implement actual pacing calculation from Bid Manager data + DV360 budget info
  // This is a stub that returns mock data
  const budget = {
    total: 100000,
    spent: 45000,
    remaining: 55000,
    currency: "USD",
  };

  const flight = {
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    daysElapsed: 150,
    daysRemaining: 215,
    totalDays: 365,
  };

  const expectedSpendPercent = (flight.daysElapsed / flight.totalDays) * 100;
  const actualSpendPercent = (budget.spent / budget.total) * 100;
  const pacingRatio = actualSpendPercent / expectedSpendPercent;

  let status: "ON_PACE" | "AHEAD" | "BEHIND" | "SEVERELY_BEHIND";
  if (pacingRatio >= 0.95 && pacingRatio <= 1.05) {
    status = "ON_PACE";
  } else if (pacingRatio > 1.05) {
    status = "AHEAD";
  } else if (pacingRatio >= 0.8) {
    status = "BEHIND";
  } else {
    status = "SEVERELY_BEHIND";
  }

  return {
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    campaignName: "Example Campaign",
    budget,
    flight,
    pacing: {
      expectedSpendPercent,
      actualSpendPercent,
      pacingRatio,
      status,
      projectedEndSpend: budget.spent * (flight.totalDays / flight.daysElapsed),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Response formatter
 */
export function getPacingStatusResponseFormatter(
  result: GetPacingStatusOutput,
  _input: GetPacingStatusInput
): any[] {
  const statusEmoji =
    result.pacing.status === "ON_PACE"
      ? "✅"
      : result.pacing.status === "AHEAD"
        ? "⚡"
        : result.pacing.status === "BEHIND"
          ? "⚠️"
          : "🚨";

  return [
    {
      type: "text" as const,
      text: `Campaign "${result.campaignName}" Pacing Status:

${statusEmoji} Status: ${result.pacing.status}

💰 Budget:
• Total: $${result.budget.total.toLocaleString()}
• Spent: $${result.budget.spent.toLocaleString()} (${result.pacing.actualSpendPercent.toFixed(1)}%)
• Remaining: $${result.budget.remaining.toLocaleString()}

📅 Flight:
• ${result.flight.startDate} to ${result.flight.endDate}
• Days: ${result.flight.daysElapsed} elapsed / ${result.flight.totalDays} total
• Days Remaining: ${result.flight.daysRemaining}

📊 Pacing Analysis:
• Expected Spend: ${result.pacing.expectedSpendPercent.toFixed(1)}%
• Actual Spend: ${result.pacing.actualSpendPercent.toFixed(1)}%
• Pacing Ratio: ${result.pacing.pacingRatio.toFixed(2)}x
• Projected End Spend: $${result.pacing.projectedEndSpend.toFixed(2)}

Full Data:
${JSON.stringify(result, null, 2)}`,
    },
  ];
}

/**
 * Tool definition (rich pattern)
 */
export const getPacingStatusTool: ToolDefinition<
  typeof GetPacingStatusInputSchema,
  typeof GetPacingStatusOutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetPacingStatusInputSchema,
  outputSchema: GetPacingStatusOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: getPacingStatusLogic,
  responseFormatter: getPacingStatusResponseFormatter,
};
