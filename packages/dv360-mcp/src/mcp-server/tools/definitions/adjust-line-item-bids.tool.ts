import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityExamplesByCategory } from "../utils/entity-examples.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";
import { ensureRequiredFieldValue } from "../utils/elicitation.js";

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
  advertiserId: z
    .string()
    .optional()
    .describe("Advertiser ID (leave blank to be prompted during elicitation)"),
  lineItemId: z
    .string()
    .optional()
    .describe("Line Item ID (leave blank to be prompted during elicitation)"),
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
          advertiserId: z.string(),
          lineItemId: z.string(),
          lineItemName: z.string().optional(),
          campaignId: z.string().optional(),
          insertionOrderId: z.string().optional(),
          previousBidMicros: z.number(),
          newBidMicros: z.number(),
        })
      )
      .describe("Successfully adjusted line items"),
    failed: z
      .array(
        z.object({
          advertiserId: z.string().optional(),
          lineItemId: z.string().optional(),
          lineItemName: z.string().optional(),
          campaignId: z.string().optional(),
          insertionOrderId: z.string().optional(),
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
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AdjustLineItemBidsOutput> {
  const { dv360Service } = resolveSessionServices(sdkContext);

  const successful: Array<{
    advertiserId: string;
    lineItemId: string;
    lineItemName?: string;
    campaignId?: string;
    insertionOrderId?: string;
    previousBidMicros: number;
    newBidMicros: number;
  }> = [];
  const failed: Array<{
    advertiserId?: string;
    lineItemId?: string;
    lineItemName?: string;
    campaignId?: string;
    insertionOrderId?: string;
    error: string;
  }> = [];

  // Process each adjustment
  for (const adjustment of input.adjustments) {
    let advertiserId: string | undefined = adjustment.advertiserId ?? undefined;
    let lineItemId: string | undefined = adjustment.lineItemId ?? undefined;
    let lineItemName: string | undefined;
    let campaignId: string | undefined;
    let insertionOrderId: string | undefined;
    try {
      const resolvedAdvertiserId = await ensureRequiredFieldValue({
        fieldName: "advertiserId",
        fieldLabel: "Advertiser ID",
        entityType: "line item",
        operation: "batch bid adjustment",
        sdkContext,
        currentValue: advertiserId,
      });
      advertiserId = resolvedAdvertiserId;

      const resolvedLineItemId = await ensureRequiredFieldValue({
        fieldName: "lineItemId",
        fieldLabel: "Line Item ID",
        entityType: "line item",
        operation: "batch bid adjustment",
        sdkContext,
        currentValue: lineItemId,
      });
      lineItemId = resolvedLineItemId;

      const entityIds = {
        advertiserId: resolvedAdvertiserId,
        lineItemId: resolvedLineItemId,
      };

      // Get current line item to extract previous bid
      const currentLineItem = (await dv360Service.getEntity("lineItem", entityIds, context)) as any;

      // Extract current bid (handle different bid strategy types)
      let previousBidMicros = 0;
      if (currentLineItem.bidStrategy?.fixedBid?.bidAmountMicros) {
        previousBidMicros = currentLineItem.bidStrategy.fixedBid.bidAmountMicros;
      } else if (currentLineItem.bidStrategy?.maximizeSpendAutoBid?.maxAverageCpmBidAmountMicros) {
        previousBidMicros =
          currentLineItem.bidStrategy.maximizeSpendAutoBid.maxAverageCpmBidAmountMicros;
      }

      // Update bid — DV360 API expects int64 as string for bidAmountMicros
      // Pass currentLineItem to avoid redundant GET inside updateEntity
      await dv360Service.updateEntity(
        "lineItem",
        entityIds,
        {
          bidStrategy: {
            fixedBid: {
              bidAmountMicros: String(adjustment.newBidMicros),
            },
          },
        },
        "bidStrategy.fixedBid.bidAmountMicros",
        context,
        currentLineItem as Record<string, unknown>
      );

      lineItemName = currentLineItem.displayName as string | undefined;
      campaignId = currentLineItem.campaignId as string | undefined;
      insertionOrderId = currentLineItem.insertionOrderId as string | undefined;

      successful.push({
        advertiserId: resolvedAdvertiserId,
        lineItemId: resolvedLineItemId,
        lineItemName,
        campaignId,
        insertionOrderId,
        previousBidMicros,
        newBidMicros: adjustment.newBidMicros,
      });
    } catch (error: any) {
      failed.push({
        advertiserId,
        lineItemId,
        lineItemName,
        campaignId,
        insertionOrderId,
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
  const note = `\n\nNote: Reminder: Bid amounts are in micros (1 USD = 1,000,000 micros). This tool updates fixed bids only.`;

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
  inputExamples: [
    {
      label: "Adjust a single line item bid",
      input: {
        adjustments: [
          { advertiserId: "1234567", lineItemId: "7654321", newBidMicros: 4500000, reason: "Increase bid due to underdelivery" },
        ],
      },
    },
    {
      label: "Batch adjust multiple line items",
      input: {
        adjustments: [
          { advertiserId: "1234567", lineItemId: "7654321", newBidMicros: 4500000 },
          { advertiserId: "1234567", lineItemId: "7654322", newBidMicros: 3200000 },
          { advertiserId: "1234567", lineItemId: "7654323", newBidMicros: 6000000, reason: "Priority placement" },
        ],
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: adjustLineItemBidsLogic,
  responseFormatter: adjustLineItemBidsResponseFormatter,
};
