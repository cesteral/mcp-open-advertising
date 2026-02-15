import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_adjust_bids";
const TOOL_TITLE = "Adjust TTD Ad Group Bids";
const TOOL_DESCRIPTION = `Batch adjust bid CPMs for multiple The Trade Desk ad groups.

For each ad group, the tool:
1. Fetches the current entity (to preserve all existing fields)
2. Updates BaseBidCPM and/or MaxBidCPM in RTBAttributes
3. PUTs the full entity back

This is a safe read-modify-write pattern that avoids accidentally clearing other fields.`;

export const AdjustBidsInputSchema = z
  .object({
    adjustments: z
      .array(
        z.object({
          adGroupId: z.string().min(1).describe("Ad group ID"),
          baseBidCpm: z.number().positive().optional().describe("New base bid CPM amount"),
          maxBidCpm: z.number().positive().optional().describe("New max bid CPM amount"),
          currencyCode: z.string().optional().describe("Currency code (default: USD)"),
        })
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
    idempotentHint: false,
  },
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
