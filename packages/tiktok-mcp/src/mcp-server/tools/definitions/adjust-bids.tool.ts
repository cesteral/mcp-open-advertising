// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
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

const TOOL_NAME = "tiktok_adjust_bids";
const TOOL_TITLE = "TikTok Ad Group Bid Adjustment";
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
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
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
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the bid adjustments and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bid-adjustment batch) without calling the TikTok API or prompting for confirmation. No bids are changed."
      ),
  })
  .describe("Parameters for batch bid adjustment on TikTok ad groups");

export const AdjustBidsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
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
      results: [],
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitBidChangeConfirmation({
    count: input.adjustments.length,
    entityLabel: "ad group",
    summary: input.reason ?? "Applying bid_price changes.",
    impactPreview: input.adjustments.map((a) => a.adGroupId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      totalRequested: input.adjustments.length,
      totalSucceeded: 0,
      totalFailed: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { tiktokService } = resolveSessionServices(sdkContext);

  const result = await tiktokService.adjustBids(
    input.adjustments.map((a) => ({
      adGroupId: a.adGroupId,
      bidPrice: a.bidPrice,
    })),
    context
  );

  const totalSucceeded = result.results.filter((r) => r.success).length;

  const effect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: {
      entity_label: "ad_group",
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
    results: result.results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `adjust_bids`. Validates the batch (positive,
 * finite bid prices) and projects the would-be effect — a bid adjustment over
 * N ad groups. TikTok has no native bid validate/preview, so both axes are
 * symbolic. Pure (no I/O).
 */
function buildAdjustBidsEffectDryRun(
  adjustments: AdjustBidsInput["adjustments"]
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  adjustments.forEach((a, i) => {
    if (!Number.isFinite(a.bidPrice) || a.bidPrice <= 0) {
      validationErrors.push({
        code: "INVALID_BID_PRICE",
        message: `bidPrice must be a positive number — got ${String(a.bidPrice)}`,
        field: `adjustments.${i}.bidPrice`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: { entity_label: "ad_group", requested: adjustments.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    "tiktok_adjust_bids",
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
          `Dry run: adjusting bids on ${n} ad group(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No bids were changed.` +
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "adjust_bids",
      operation: ["adjust_bids"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "tiktok.adjust_bids.v1",
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
        advertiserId: "1234567890",
        adjustments: [{ adGroupId: "1700123456789", bidPrice: 1.5 }],
      },
    },
    {
      label: "Multiple bid adjustments with reason",
      input: {
        advertiserId: "1234567890",
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
