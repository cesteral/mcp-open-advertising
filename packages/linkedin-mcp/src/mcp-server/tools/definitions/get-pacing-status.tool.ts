// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { calculatePacingStatus } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext, ToolDefinition } from "@cesteral/shared";

const TOOL_NAME = "linkedin_get_pacing_status";
const TOOL_TITLE = "Calculate Campaign Pacing (Client-Side)";
const TOOL_DESCRIPTION =
  "Client-side pacing calculator — does NOT call the LinkedIn API. Computes actual vs expected delivery given caller-supplied budget, spend-to-date, and flight dates. " +
  "To populate spend, first call \`linkedin_get_analytics\`; to populate budget and flight dates, first call \`linkedin_get_entity\` for the campaign.";

/**
 * Input schema
 */
export const GetPacingStatusInputSchema = z
  .object({
    accountId: z
      .string()
      .min(1)
      .describe("LinkedIn Sponsored Account ID (numeric portion of the URN)"),
    campaignId: z
      .string()
      .min(1)
      .describe("LinkedIn Sponsored Campaign ID (numeric portion of the URN) to check pacing for"),
    spendToDate: z.number().min(0).describe("Total spend to date in account currency"),
    budgetTotal: z.number().min(0).describe("Total campaign budget in account currency"),
    flightStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Flight start date (YYYY-MM-DD)"),
    flightEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .describe("Flight end date (YYYY-MM-DD)"),
    currency: z.string().default("USD").describe("Currency code (default: USD)"),
  })
  .describe("Parameters for checking campaign pacing status");

/**
 * Output schema
 */
export const GetPacingStatusOutputSchema = z
  .object({
    accountId: z.string(),
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
  _sdkContext?: SdkContext
): Promise<GetPacingStatusOutput> {
  const pacingStatus = calculatePacingStatus({
    spendToDate: input.spendToDate,
    budgetTotal: input.budgetTotal,
    flightStartDate: input.flightStartDate,
    flightEndDate: input.flightEndDate,
  });

  return {
    accountId: input.accountId,
    campaignId: input.campaignId,
    budget: {
      total: input.budgetTotal,
      spent: input.spendToDate,
      remaining: Math.max(0, input.budgetTotal - input.spendToDate),
      currency: input.currency,
    },
    flight: {
      startDate: input.flightStartDate,
      endDate: input.flightEndDate,
      daysElapsed: pacingStatus.daysElapsed,
      daysRemaining: pacingStatus.daysRemaining,
      totalDays: pacingStatus.totalDays,
    },
    pacing: {
      expectedSpendPercent: pacingStatus.expectedSpendPercent,
      actualSpendPercent: pacingStatus.actualSpendPercent,
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
        accountId: "503491473",
        campaignId: "123456789",
        spendToDate: 18000,
        budgetTotal: 50000,
        flightStartDate: "2026-03-01",
        flightEndDate: "2026-03-31",
        currency: "USD",
      },
    },
    {
      label: "Check pacing for a short-burst campaign in GBP",
      input: {
        accountId: "512233445",
        campaignId: "987654321",
        spendToDate: 4200,
        budgetTotal: 10000,
        flightStartDate: "2026-03-15",
        flightEndDate: "2026-03-21",
        currency: "GBP",
      },
    },
  ],
  logic: getPacingStatusLogic,
  responseFormatter: getPacingStatusResponseFormatter,
};
