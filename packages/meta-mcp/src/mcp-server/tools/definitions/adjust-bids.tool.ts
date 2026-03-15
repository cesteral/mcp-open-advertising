// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_adjust_bids";
const TOOL_TITLE = "Meta Ads Bid Adjustment";
const TOOL_DESCRIPTION = `Batch adjust ad set bid amounts with safe read-modify-write.

Reads current bids, applies new values, and reports previous/new amounts.
Amounts are in cents (100 = $1.00 USD).

**Gotchas:**
- Only applies to ad sets with manual bidding (bid_amount field).
- Ad sets using auto-bidding strategies (e.g., LOWEST_COST_WITHOUT_CAP) may ignore bid_amount.
- A warning is included in results for ad sets that appear to use auto-bidding.
- Budget values are in cents (100 = $1.00 USD).
- Each read + write pair consumes 4x rate limit tokens total.
- Max 50 adjustments per call.`;

// ─── Auto-bidding strategies that ignore bid_amount ──────────────────
const AUTO_BID_STRATEGIES = new Set([
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
]);

// ─── Input Schema ───────────────────────────────────────────────────

export const AdjustBidsInputSchema = z
  .object({
    adjustments: z
      .array(
        z.object({
          adSetId: z
            .string()
            .min(1)
            .describe("The ad set ID to adjust"),
          bidAmount: z
            .number()
            .int()
            .min(1)
            .describe("New bid amount in cents (100 = $1.00 USD)"),
        })
      )
      .min(1)
      .max(50)
      .describe("Bid adjustments to apply (max 50)"),
    reason: z
      .string()
      .optional()
      .describe("Optional reason for the bid adjustment"),
  })
  .describe("Parameters for batch bid adjustment on Meta ad sets");

// ─── Output Schema ──────────────────────────────────────────────────

export const AdjustBidsOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        adSetId: z.string(),
        success: z.boolean(),
        adSetName: z.string().optional(),
        previousBidAmount: z.number().optional(),
        newBidAmount: z.number().optional(),
        warning: z.string().optional(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
  })
  .describe("Bid adjustment results");

// ─── Types ──────────────────────────────────────────────────────────

type AdjustBidsInput = z.infer<typeof AdjustBidsInputSchema>;
type AdjustBidsOutput = z.infer<typeof AdjustBidsOutputSchema>;

interface AdjustBidsResult {
  adSetId: string;
  success: boolean;
  adSetName?: string;
  previousBidAmount?: number;
  newBidAmount?: number;
  warning?: string;
  error?: string;
}

// ─── Logic ──────────────────────────────────────────────────────────

export async function adjustBidsLogic(
  input: AdjustBidsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AdjustBidsOutput> {
  const { metaService } = resolveSessionServices(sdkContext);

  const results: AdjustBidsResult[] = [];

  // Process adjustments sequentially to respect rate limits
  for (const adjustment of input.adjustments) {
    try {
      // Step 1: Read current ad set state
      const entity = (await metaService.getEntity(
        "adSet",
        adjustment.adSetId,
        ["id", "name", "bid_amount", "bid_strategy"],
        context
      )) as Record<string, unknown>;

      const adSetName = entity.name as string | undefined;
      const previousBidAmount =
        entity.bid_amount != null ? Number(entity.bid_amount) : undefined;
      const bidStrategy = entity.bid_strategy as string | undefined;

      // Step 2: Check for auto-bidding strategies
      let warning: string | undefined;
      if (bidStrategy && AUTO_BID_STRATEGIES.has(bidStrategy)) {
        warning = `Ad set uses auto-bidding strategy "${bidStrategy}"; bid_amount may be ignored.`;
      }

      // Step 3: Update bid amount
      await metaService.updateEntity(
        adjustment.adSetId,
        { bid_amount: adjustment.bidAmount },
        context
      );

      results.push({
        adSetId: adjustment.adSetId,
        success: true,
        adSetName,
        previousBidAmount,
        newBidAmount: adjustment.bidAmount,
        warning,
      });
    } catch (error) {
      results.push({
        adSetId: adjustment.adSetId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totalSucceeded = results.filter((r) => r.success).length;

  return {
    totalRequested: input.adjustments.length,
    totalSucceeded,
    totalFailed: input.adjustments.length - totalSucceeded,
    results,
    timestamp: new Date().toISOString(),
  };
}

// ─── Response Formatter ─────────────────────────────────────────────

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
  const lines: string[] = [];

  lines.push(
    `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`
  );
  lines.push("");

  for (const r of result.results) {
    if (r.success) {
      const name = r.adSetName ? ` (${r.adSetName})` : "";
      const prev = r.previousBidAmount ?? "unknown";
      lines.push(`  ${r.adSetId}${name}: ${prev} -> ${r.newBidAmount} cents`);
      if (r.warning) {
        lines.push(`    WARNING: ${r.warning}`);
      }
    } else {
      lines.push(`  ${r.adSetId}: FAILED - ${r.error}`);
    }
  }

  lines.push("");
  lines.push("Amounts in cents (100 = $1.00 USD)");
  lines.push(`Timestamp: ${result.timestamp}`);

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
    },
  ];
}

// ─── Tool Definition ────────────────────────────────────────────────

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
        adjustments: [{ adSetId: "23851234567890", bidAmount: 500 }],
      },
    },
    {
      label: "Multiple bid adjustments with reason",
      input: {
        adjustments: [
          { adSetId: "23851111", bidAmount: 350 },
          { adSetId: "23852222", bidAmount: 750 },
        ],
        reason: "Increase bids to improve delivery pacing",
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};