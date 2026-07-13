// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityExamplesByCategory } from "../utils/entity-examples.js";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import { ensureRequiredFieldValue } from "../utils/elicitation.js";
import {
  buildNextAction,
  elicitBidChangeConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";

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
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the bid adjustments and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bid-adjustment batch) without calling the DV360 API or prompting for confirmation. No bids are changed."
      ),
  })
  .describe("Parameters for batch bid adjustment");

/**
 * Output schema for adjust line item bids tool
 */
export const AdjustLineItemBidsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
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
          nextAction: z.string().optional(),
        })
      )
      .describe("Failed adjustments with error messages"),
    totalRequested: z.number().describe("Total adjustments requested"),
    totalSuccessful: z.number().describe("Total successful adjustments"),
    totalFailed: z.number().describe("Total failed adjustments"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No bids were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `bids_adjusted` + scalar audit summary). Present on a confirmed execute."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `adjust_bids` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
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
  // Effect-class write: no canonical entity snapshot. Capability is
  // `adjust_bids` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "adjust_bids",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    const dryRun = buildAdjustBidsEffectDryRun(input.adjustments);
    return {
      confirmed: true,
      successful: [],
      failed: [],
      totalRequested: input.adjustments.length,
      totalSuccessful: 0,
      totalFailed: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Operator-supplied audit reasons are per-adjustment (finding M1). Collect the
  // distinct non-empty ones so they surface in the confirmation prompt and the
  // governed effect summary instead of being dropped silently.
  const adjustmentReasons = [
    ...new Set(input.adjustments.map((a) => a.reason).filter((r): r is string => Boolean(r))),
  ];

  const confirmed = await elicitBidChangeConfirmation({
    count: input.adjustments.length,
    entityLabel: "line item",
    summary:
      adjustmentReasons.length > 0
        ? adjustmentReasons.join("; ")
        : "Applying fixedBid micros changes (1 USD = 1,000,000 micros).",
    impactPreview: input.adjustments.map((a) => a.lineItemId ?? "(to elicit)"),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      successful: [],
      failed: [],
      totalRequested: input.adjustments.length,
      totalSuccessful: 0,
      totalFailed: 0,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

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
    nextAction?: string;
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
      // DV360 API returns int64 fields as strings — convert to number
      let previousBidMicros = 0;
      if (currentLineItem.bidStrategy?.fixedBid?.bidAmountMicros) {
        previousBidMicros = Number(currentLineItem.bidStrategy.fixedBid.bidAmountMicros);
      } else if (currentLineItem.bidStrategy?.maximizeSpendAutoBid?.maxAverageCpmBidAmountMicros) {
        previousBidMicros = Number(
          currentLineItem.bidStrategy.maximizeSpendAutoBid.maxAverageCpmBidAmountMicros
        );
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
        nextAction:
          !advertiserId || !lineItemId
            ? buildNextAction({
                kind: "list-entity",
                tool: "dv360_list_entities",
                entityType: "lineItem",
                field: !advertiserId ? "advertiserId" : "lineItemId",
              })
            : buildNextAction({
                kind: "read-resource",
                uri: "entity-schema://lineItem",
                purpose: "line item bidStrategy fields before retrying the failed adjustment",
              }),
      });
    }
  }

  const effect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: {
      entity_label: "line_item",
      requested: input.adjustments.length,
      succeeded: successful.length,
      failed: failed.length,
      // Record the operator-supplied per-adjustment audit reasons into the
      // governed effect summary (finding M1) so they survive into the tool
      // response / audit log instead of being dropped. The summary holds scalars,
      // so the distinct reasons are joined into one field.
      ...(adjustmentReasons.length > 0 ? { reason: adjustmentReasons.join("; ") } : {}),
    },
  };

  return {
    confirmed: true,
    successful,
    failed,
    totalRequested: input.adjustments.length,
    totalSuccessful: successful.length,
    totalFailed: failed.length,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `adjust_bids`. Validates the batch (each
 * `newBidMicros` is a positive integer) and projects the would-be effect — a bid
 * adjustment over N line items. DV360 has no native bid validate/preview wired
 * here, so both axes are symbolic. Pure (no I/O).
 */
function buildAdjustBidsEffectDryRun(
  adjustments: AdjustLineItemBidsInput["adjustments"]
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  adjustments.forEach((a, i) => {
    if (!Number.isInteger(a.newBidMicros) || a.newBidMicros <= 0) {
      validationErrors.push({
        code: "INVALID_BID_MICROS",
        message: `newBidMicros must be a positive integer (micros) — got ${String(a.newBidMicros)}`,
        field: `adjustments.${i}.newBidMicros`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: { entity_label: "line_item", requested: adjustments.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    "dv360_adjust_line_item_bids",
    { requiresValidation: true, requiresSimulation: true }
  );
}

/**
 * Format response for MCP client
 */
export function adjustLineItemBidsResponseFormatter(
  result: AdjustLineItemBidsOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const n = result.dryRun.expectedEffect?.summary.requested ?? result.totalRequested;
    return [
      {
        type: "text" as const,
        text:
          `Dry run: adjusting bids on ${n} line item(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No bids were changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bid adjustments cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
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
          {
            advertiserId: "1234567",
            lineItemId: "7654321",
            newBidMicros: 4500000,
            reason: "Increase bid due to underdelivery",
          },
        ],
      },
    },
    {
      label: "Batch adjust multiple line items",
      input: {
        adjustments: [
          { advertiserId: "1234567", lineItemId: "7654321", newBidMicros: 4500000 },
          { advertiserId: "1234567", lineItemId: "7654322", newBidMicros: 3200000 },
          {
            advertiserId: "1234567",
            lineItemId: "7654323",
            newBidMicros: 6000000,
            reason: "Priority placement",
          },
        ],
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "adjust_bids",
      operation: ["adjust_bids"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "dv360.adjust_bids.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: adjustLineItemBidsLogic,
  responseFormatter: adjustLineItemBidsResponseFormatter,
};
