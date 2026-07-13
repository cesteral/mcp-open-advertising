// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import {
  elicitBidChangeConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
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
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the bid adjustments and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bid-adjustment batch) without calling the Amazon DSP API or prompting for confirmation. No bids are changed."
      ),
  })
  .describe("Parameters for batch bid adjustment on Amazon DSP line items");

export const AdjustBidsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
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
  .describe("Bid adjustment results");

type AdjustBidsInput = z.infer<typeof AdjustBidsInputSchema>;
type AdjustBidsOutput = z.infer<typeof AdjustBidsOutputSchema>;

export async function adjustBidsLogic(
  input: AdjustBidsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<AdjustBidsOutput> {
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
      totalRequested: input.adjustments.length,
      totalSucceeded: 0,
      totalFailed: 0,
      reason: input.reason,
      results: [],
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitBidChangeConfirmation({
    count: input.adjustments.length,
    entityLabel: "line item",
    summary: input.reason ?? "Applying bidAmount changes.",
    impactPreview: input.adjustments.map((a) => a.lineItemId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      totalRequested: input.adjustments.length,
      totalSucceeded: 0,
      totalFailed: 0,
      reason: input.reason,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { amazonDspService, boundProfileId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.profileId, boundProfileId, "profileId");

  const result = await amazonDspService.adjustBids(
    input.adjustments.map((a) => ({
      lineItemId: a.lineItemId,
      bidAmount: a.bidAmount,
    })),
    context
  );

  const totalSucceeded = result.results.filter((r) => r.success).length;

  const effect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: {
      entity_label: "line_item",
      requested: input.adjustments.length,
      succeeded: totalSucceeded,
      failed: input.adjustments.length - totalSucceeded,
    },
  };

  return {
    confirmed: true,
    totalRequested: input.adjustments.length,
    totalSucceeded,
    totalFailed: input.adjustments.length - totalSucceeded,
    reason: input.reason,
    results: result.results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `adjust_bids`. Validates the batch (positive,
 * finite bid amounts) and projects the would-be effect — a bid adjustment over
 * N line items. Amazon DSP has no native bid validate/preview, so both axes are
 * symbolic. Pure (no I/O).
 */
function buildAdjustBidsEffectDryRun(
  adjustments: AdjustBidsInput["adjustments"]
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  adjustments.forEach((a, i) => {
    if (!Number.isFinite(a.bidAmount) || a.bidAmount <= 0) {
      validationErrors.push({
        code: "INVALID_BID_AMOUNT",
        message: `bidAmount must be a positive number — got ${String(a.bidAmount)}`,
        field: `adjustments.${i}.bidAmount`,
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
    "amazon_dsp_adjust_bids",
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "adjust_bids",
      operation: ["adjust_bids"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "amazon_dsp.adjust_bids.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
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
