// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_adjust_bids";
const TOOL_TITLE = "Pinterest Ad Group Bid Adjustment";
const TOOL_DESCRIPTION = `Batch adjust ad group bid prices with safe read-modify-write.

Reads current bid prices, applies new values, and reports previous/new amounts.
Bid prices are in the advertiser's account currency.

**Gotchas:**
- Only applies to ad groups with manual bidding (bid_price field).
- Ad groups using automated bidding strategies may ignore bid_price.
- Each read + write pair consumes rate limit tokens.
- Max 50 adjustments per call.`;

export const AdjustBidsInputSchema = z
  .object({
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    adjustments: z
      .array(
        z.object({
          adGroupId: z.string().min(1).describe("The ad group ID to adjust"),
          bidPrice: z.number().positive().describe("New bid price in the advertiser's currency"),
        })
      )
      .min(1)
      .max(50)
      .describe("Bid adjustments to apply (max 50)"),
    reason: z.string().optional().describe("Optional reason for the bid adjustment"),
  })
  .describe("Parameters for batch bid adjustment on Pinterest ad groups");

export const AdjustBidsOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        adGroupId: z.string(),
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
  const { pinterestService } = resolveSessionServices(sdkContext);

  const result = await pinterestService.adjustBids(
    { adAccountId: input.adAccountId },
    input.adjustments.map((a) => ({
      adGroupId: a.adGroupId,
      bidPrice: a.bidPrice,
    })),
    context
  );

  const totalSucceeded = result.results.filter((r) => r.success).length;

  return {
    totalRequested: input.adjustments.length,
    totalSucceeded,
    totalFailed: input.adjustments.length - totalSucceeded,
    results: result.results,
    timestamp: new Date().toISOString(),
  };
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
  const lines: string[] = [
    `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      const prev = r.previousBid ?? "unknown";
      lines.push(`  ${r.adGroupId}: ${prev} -> ${r.newBid}`);
    } else {
      lines.push(`  ${r.adGroupId}: FAILED - ${r.error}`);
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
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Single bid adjustment",
      input: {
        adAccountId: "1234567890",
        adjustments: [{ adGroupId: "1700123456789", bidPrice: 1.5 }],
      },
    },
    {
      label: "Multiple bid adjustments with reason",
      input: {
        adAccountId: "1234567890",
        adjustments: [
          { adGroupId: "1700111111111", bidPrice: 2.0 },
          { adGroupId: "1700222222222", bidPrice: 1.2 },
        ],
        reason: "Increase bids to improve delivery pacing",
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
