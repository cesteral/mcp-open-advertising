// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_adjust_bids";
const TOOL_TITLE = "Amazon DSP Line Item Bid Adjustment";
const TOOL_DESCRIPTION = `Batch adjust line item bid prices with safe read-modify-write.

Reads current bid prices, applies new values, and reports previous/new amounts.
Bid prices are in the advertiser's account currency.

**Gotchas:**
- Only applies to line items with manual bidding (bidding.bidOptimization.bidAmount field).
- Line items using automated bidding strategies may ignore the bid amount.
- Each read + write pair consumes API quota.
- Max 50 adjustments per call.`;

export const AdjustBidsInputSchema = z
  .object({
    profileId: z.string().min(1).describe("AmazonDsp Advertiser ID"),
    adjustments: z
      .array(
        z.object({
          lineItemId: z.string().min(1).describe("The line item ID to adjust"),
          bidAmount: z.number().positive().describe("New bid amount in the advertiser's currency"),
        })
      )
      .min(1)
      .max(50)
      .describe("Bid adjustments to apply (max 50)"),
    reason: z.string().optional().describe("Optional reason for the bid adjustment"),
  })
  .describe("Parameters for batch bid adjustment on Amazon DSP line items");

export const AdjustBidsOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    reason: z.string().optional(),
    results: z.array(
      z.object({
        lineItemId: z.string(),
        success: z.boolean(),
        previousBid: z.number().optional(),
        newBid: z.number().optional(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bid adjustment results");

type AdjustBidsInput = z.infer<typeof AdjustBidsInputSchema>;
type AdjustBidsOutput = z.infer<typeof AdjustBidsOutputSchema>;

export async function adjustBidsLogic(
  input: AdjustBidsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AdjustBidsOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const result = await amazonDspService.adjustBids(
    input.adjustments.map((a) => ({
      lineItemId: a.lineItemId,
      bidAmount: a.bidAmount,
    })),
    context
  );

  const totalSucceeded = result.results.filter((r) => r.success).length;

  return {
    totalRequested: input.adjustments.length,
    totalSucceeded,
    totalFailed: input.adjustments.length - totalSucceeded,
    reason: input.reason,
    results: result.results,
    timestamp: new Date().toISOString(),
  };
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
  const lines: string[] = [
    `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`,
  ];

  if (result.reason) {
    lines.push(`Reason: ${result.reason}`);
  }

  lines.push("");

  for (const r of result.results) {
    if (r.success) {
      const prev = r.previousBid ?? "unknown";
      lines.push(`  ${r.lineItemId}: ${prev} -> ${r.newBid}`);
    } else {
      lines.push(`  ${r.lineItemId}: FAILED - ${r.error}`);
    }
  }

  lines.push("", `Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const adjustBidsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: AdjustBidsInputSchema,
  outputSchema: AdjustBidsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Single bid adjustment",
      input: {
        profileId: "1234567890",
        adjustments: [{ lineItemId: "1700123456789", bidAmount: 1.5 }],
      },
    },
    {
      label: "Multiple bid adjustments with reason",
      input: {
        profileId: "1234567890",
        adjustments: [
          { lineItemId: "1700111111111", bidAmount: 2.0 },
          { lineItemId: "1700222222222", bidAmount: 1.2 },
        ],
        reason: "Increase bids to improve delivery pacing",
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
