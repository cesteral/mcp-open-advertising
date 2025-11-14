import { z } from "zod";
import { container } from "tsyringe";
import { DV360Service } from "../../../services/dv360/DV360Service.js";
import { getEntityExamplesByCategory } from "../utils/entityExamples.js";
import type { RequestContext } from "../../../utils/internal/requestContext.js";

const TOOL_NAME = "dv360_adjust_line_item_bids";
const TOOL_TITLE = "Adjust Line Item Bids";

// Generate dynamic description with bid examples
function generateBidToolDescription(): string {
  const bidExamples = getEntityExamplesByCategory("lineItem", "bid");

  let description = `Batch update bids for multiple line items in a single operation (Tier 2 workflow tool).

**Important Notes:**
- Bid amounts must be in micros (1 USD = 1,000,000 micros)
- This tool updates fixed bids (fixedBid strategy)
- For auto-bidding, use the generic update_entity tool

**Supported Bid Updates:**`;

  bidExamples.forEach((ex) => {
    description += `\n- ${ex.operation}: ${ex.notes}`;
  });

  return description;
}

const TOOL_DESCRIPTION = generateBidToolDescription();

/**
 * Bid adjustment specification
 */
const BidAdjustmentSchema = z.object({
  advertiserId: z.string().describe("Advertiser ID"),
  lineItemId: z.string().describe("Line Item ID"),
  newBidMicros: z.number().int().positive().describe("New bid amount in micros"),
  reason: z.string().optional().describe("Reason for bid adjustment (audit trail)"),
});

/**
 * Input schema for adjust line item bids tool
 */
export const AdjustLineItemBidsInputSchema = z
  .object({
    adjustments: z
      .array(BidAdjustmentSchema)
      .min(1)
      .max(50)
      .describe("List of bid adjustments to apply (max 50)"),
  })
  .describe("Parameters for batch bid adjustment");

/**
 * Output schema for adjust line item bids tool
 */
export const AdjustLineItemBidsOutputSchema = z
  .object({
    successful: z
      .array(
        z.object({
          lineItemId: z.string(),
          previousBidMicros: z.number(),
          newBidMicros: z.number(),
        })
      )
      .describe("Successfully adjusted line items"),
    failed: z
      .array(
        z.object({
          lineItemId: z.string(),
          error: z.string(),
        })
      )
      .describe("Failed adjustments with error messages"),
    totalRequested: z.number().describe("Total adjustments requested"),
    totalSuccessful: z.number().describe("Total successful adjustments"),
    totalFailed: z.number().describe("Total failed adjustments"),
    timestamp: z.string().datetime(),
  })
  .describe("Batch bid adjustment result");

type AdjustLineItemBidsInput = z.infer<typeof AdjustLineItemBidsInputSchema>;
type AdjustLineItemBidsOutput = z.infer<typeof AdjustLineItemBidsOutputSchema>;

/**
 * Adjust line item bids tool logic
 */
export async function adjustLineItemBidsLogic(
  input: AdjustLineItemBidsInput,
  context: RequestContext
): Promise<AdjustLineItemBidsOutput> {
  const dv360Service = container.resolve(DV360Service);

  const successful: Array<{
    lineItemId: string;
    previousBidMicros: number;
    newBidMicros: number;
  }> = [];
  const failed: Array<{ lineItemId: string; error: string }> = [];

  // Process each adjustment
  for (const adjustment of input.adjustments) {
    try {
      const entityIds = {
        advertiserId: adjustment.advertiserId,
        lineItemId: adjustment.lineItemId,
      };

      // Get current line item to extract previous bid
      const currentLineItem = (await dv360Service.getEntity(
        "lineItem",
        entityIds,
        context
      )) as any;

      // Extract current bid (handle different bid strategy types)
      let previousBidMicros = 0;
      if (currentLineItem.bidStrategy?.fixedBid?.bidAmountMicros) {
        previousBidMicros = currentLineItem.bidStrategy.fixedBid.bidAmountMicros;
      } else if (currentLineItem.bidStrategy?.maximizeSpendAutoBid?.maxAverageCpmBidAmountMicros) {
        previousBidMicros =
          currentLineItem.bidStrategy.maximizeSpendAutoBid.maxAverageCpmBidAmountMicros;
      }

      // Update bid
      await dv360Service.updateEntity(
        "lineItem",
        entityIds,
        {
          bidStrategy: {
            fixedBid: {
              bidAmountMicros: adjustment.newBidMicros,
            },
          },
        },
        "bidStrategy.fixedBid.bidAmountMicros",
        context
      );

      successful.push({
        lineItemId: adjustment.lineItemId,
        previousBidMicros,
        newBidMicros: adjustment.newBidMicros,
      });
    } catch (error: any) {
      failed.push({
        lineItemId: adjustment.lineItemId,
        error: error.message || String(error),
      });
    }
  }

  return {
    successful,
    failed,
    totalRequested: input.adjustments.length,
    totalSuccessful: successful.length,
    totalFailed: failed.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function adjustLineItemBidsResponseFormatter(result: AdjustLineItemBidsOutput): any {
  const summary = `Batch bid adjustment completed: ${result.totalSuccessful}/${result.totalRequested} successful`;
  const successList =
    result.successful.length > 0
      ? `\n\nSuccessful adjustments:\n${JSON.stringify(result.successful, null, 2)}`
      : "";
  const failedList =
    result.failed.length > 0
      ? `\n\nFailed adjustments:\n${JSON.stringify(result.failed, null, 2)}`
      : "";

  // Add helpful reminder about bid format
  const note = `\n\n💡 Reminder: Bid amounts are in micros (1 USD = 1,000,000 micros). This tool updates fixed bids only.`;

  return [
    {
      type: "text" as const,
      text: `${summary}${successList}${failedList}${note}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Adjust Line Item Bids Tool Definition
 */
export const adjustLineItemBidsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: AdjustLineItemBidsInputSchema,
  outputSchema: AdjustLineItemBidsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: adjustLineItemBidsLogic,
  responseFormatter: adjustLineItemBidsResponseFormatter,
};
