import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_adjust_bids";
const TOOL_TITLE = "Adjust TTD Ad Group Bids";
const TOOL_DESCRIPTION = `Batch adjust bid CPMs for multiple The Trade Desk ad groups.

For each ad group, the tool:
1. Fetches the current entity (to preserve all existing fields)
2. Updates BaseBidCPM and/or MaxBidCPM in RTBAttributes
3. PUTs the full entity back

This is a safe read-modify-write pattern that avoids accidentally clearing other fields.

**Note:** Concurrent bid adjustments to the same ad group may cause one update to overwrite the other, since TTD does not support optimistic locking. Avoid adjusting the same ad group in parallel.`;

export const AdjustBidsInputSchema = z
  .object({
    adjustments: z
      .array(
        z.object({
          adGroupId: z.string().min(1).describe("Ad group ID"),
          baseBidCpm: z.number().positive().optional().describe("New base bid CPM amount"),
          maxBidCpm: z.number().positive().optional().describe("New max bid CPM amount"),
          currencyCode: z.string().optional().describe("Currency code (default: USD)"),
        }).refine(
          (adj) => adj.baseBidCpm !== undefined || adj.maxBidCpm !== undefined,
          { message: "At least one of baseBidCpm or maxBidCpm must be provided" }
        )
      )
      .min(1)
      .max(50)
      .describe("Array of bid adjustments (max 50)"),
  })
  .describe("Parameters for batch bid adjustment");

export const AdjustBidsOutputSchema = z
  .object({
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        adGroupId: z.string(),
        success: z.boolean(),
        entity: z.record(z.any()).optional(),
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
  const { ttdService } = resolveSessionServices(sdkContext);

  const { results } = await ttdService.adjustBids(input.adjustments, context);

  const succeeded = results.filter((r) => r.success).length;

  return {
    totalRequested: input.adjustments.length,
    totalSucceeded: succeeded,
    totalFailed: input.adjustments.length - succeeded,
    results: results.map((r) => ({
      adGroupId: r.adGroupId,
      success: r.success,
      entity: r.entity as Record<string, any> | undefined,
      error: r.error,
    })),
    timestamp: new Date().toISOString(),
  };
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): any {
  const summary = result.results
    .map((r) => {
      if (r.success) {
        const rtb = (r.entity as any)?.RTBAttributes;
        const base = rtb?.BaseBidCPM?.Amount ?? "?";
        const max = rtb?.MaxBidCPM?.Amount ?? "?";
        return `  ✓ ${r.adGroupId}: base=$${base}, max=$${max}`;
      }
      return `  ✗ ${r.adGroupId}: ${r.error}`;
    })
    .join("\n");

  return [
    {
      type: "text" as const,
      text: `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded\n\n${summary}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
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
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Adjust a single ad group bid",
      input: {
        adjustments: [
          { adGroupId: "ag789ghi", baseBidCpm: 4.50 },
        ],
      },
    },
    {
      label: "Batch adjust multiple ad groups",
      input: {
        adjustments: [
          { adGroupId: "ag001", baseBidCpm: 3.00, maxBidCpm: 8.00 },
          { adGroupId: "ag002", baseBidCpm: 5.50 },
          { adGroupId: "ag003", maxBidCpm: 12.00, currencyCode: "EUR" },
        ],
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
