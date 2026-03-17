// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, ToolDefinition } from "../../../types-global/mcp.js";
import { daysBetween } from "../../../utils/date.js";

const TOOL_NAME = "dbm_get_pacing_status";
const TOOL_TITLE = "Get Pacing Status";
const TOOL_DESCRIPTION =
  "Get real-time pacing status for a campaign (actual vs expected delivery). Requires budget and flight dates as inputs.";

/**
 * Input schema
 */
export const GetPacingStatusInputSchema = z
  .object({
    advertiserId: z.string().min(1).describe("DV360 Advertiser ID"),
    campaignId: z.string().min(1).describe("The campaign ID to check pacing for"),
    budgetTotal: z.number().min(0).describe("Total campaign budget in advertiser currency"),
    flightStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Campaign flight start date (YYYY-MM-DD)"),
    flightEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Campaign flight end date (YYYY-MM-DD)"),
    currency: z.string().default("USD").describe("Currency code (default: USD)"),
  })
  .describe("Parameters for checking campaign pacing status");

/**
 * Output schema
 */
export const GetPacingStatusOutputSchema = z
  .object({
    advertiserId: z.string(),
    campaignId: z.string(),
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
  sdkContext?: SdkContext
): Promise<GetPacingStatusOutput> {
  // Resolve services for this session
  const { bidManagerService } = resolveSessionServices(sdkContext);

  // Get pacing status from Bid Manager API
  const pacingStatus = await bidManagerService.getPacingStatus({
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    budgetTotal: input.budgetTotal,
    flightStartDate: input.flightStartDate,
    flightEndDate: input.flightEndDate,
  });

  // Calculate flight details
  const totalDays = daysBetween(input.flightStartDate, input.flightEndDate) + 1;
  const today = new Date().toISOString().split("T")[0];
  const effectiveEndDate = today < input.flightEndDate ? today : input.flightEndDate;
  const daysElapsed = daysBetween(input.flightStartDate, effectiveEndDate) + 1;

  return {
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    budget: {
      total: input.budgetTotal,
      spent: pacingStatus.spendToDate,
      remaining: Math.max(0, input.budgetTotal - pacingStatus.spendToDate),
      currency: input.currency,
    },
    flight: {
      startDate: input.flightStartDate,
      endDate: input.flightEndDate,
      daysElapsed,
      daysRemaining: pacingStatus.daysRemaining,
      totalDays,
    },
    pacing: {
      expectedSpendPercent: pacingStatus.expectedDeliveryPercent,
      actualSpendPercent: pacingStatus.actualDeliveryPercent,
      pacingRatio: pacingStatus.pacingRatio,
      status: pacingStatus.status,
      projectedEndSpend: pacingStatus.projectedEndSpend,
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
): McpTextContent[] {
  const statusEmoji =
    result.pacing.status === "ON_PACE"
      ? "[OK]"
      : result.pacing.status === "AHEAD"
        ? "[AHEAD]"
        : result.pacing.status === "BEHIND"
          ? "[BEHIND]"
          : "[CRITICAL]";

  return [
    {
      type: "text" as const,
      text: `Campaign "${result.campaignId}" Pacing Status:

${statusEmoji} Status: ${result.pacing.status}

Budget:
• Total: $${result.budget.total.toLocaleString()}
• Spent: $${result.budget.spent.toLocaleString()} (${result.pacing.actualSpendPercent.toFixed(1)}%)
• Remaining: $${result.budget.remaining.toLocaleString()}

Flight:
• ${result.flight.startDate} to ${result.flight.endDate}
• Days: ${result.flight.daysElapsed} elapsed / ${result.flight.totalDays} total
• Days Remaining: ${result.flight.daysRemaining}

Pacing Analysis:
• Expected Spend: ${result.pacing.expectedSpendPercent.toFixed(1)}%
• Actual Spend: ${result.pacing.actualSpendPercent.toFixed(1)}%
• Pacing Ratio: ${result.pacing.pacingRatio.toFixed(2)}x
• Projected End Spend: $${result.pacing.projectedEndSpend.toFixed(2)}`,
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
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Check pacing for a standard monthly campaign",
      input: {
        advertiserId: "1234567",
        campaignId: "9876543",
        budgetTotal: 50000,
        flightStartDate: "2026-02-01",
        flightEndDate: "2026-02-28",
        currency: "USD",
      },
    },
    {
      label: "Check pacing for a short-burst campaign in GBP",
      input: {
        advertiserId: "7654321",
        campaignId: "1122334",
        budgetTotal: 10000,
        flightStartDate: "2026-02-15",
        flightEndDate: "2026-02-21",
        currency: "GBP",
      },
    },
    {
      label: "Check pacing for a Q1 brand awareness campaign (default USD)",
      input: {
        advertiserId: "9988776",
        campaignId: "5544332",
        budgetTotal: 250000,
        flightStartDate: "2026-01-01",
        flightEndDate: "2026-03-31",
      },
    },
  ],
  logic: getPacingStatusLogic,
  responseFormatter: getPacingStatusResponseFormatter,
};