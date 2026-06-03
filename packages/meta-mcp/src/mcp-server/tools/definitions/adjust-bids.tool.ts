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
const AUTO_BID_STRATEGIES = new Set(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_MIN_ROAS"]);

// ─── Input Schema ───────────────────────────────────────────────────

export const AdjustBidsInputSchema = z
  .object({
    adjustments: z
      .array(
        z.object({
          adSetId: z.string().min(1).describe("The ad set ID to adjust"),
          bidAmount: z.number().int().min(1).describe("New bid amount in cents (100 = $1.00 USD)"),
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
        "When true, validates the bid adjustments and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bid-adjustment batch) without calling the Meta API or prompting for confirmation. No bids are changed."
      ),
  })
  .describe("Parameters for batch bid adjustment on Meta ad sets");

// ─── Output Schema ──────────────────────────────────────────────────

export const AdjustBidsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
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
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No bids were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `bids_adjusted` + scalar audit summary). Present on a confirmed execute. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `adjust_bids` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
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
  // Effect-class write: no canonical entity snapshot. The capability is
  // `adjust_bids` with a null entity kind on every response.
  const dispatchedCapability: DispatchedCapability = {
    operation: "adjust_bids",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the batch and project the would-be effect
  // (a bid-adjustment over N ad sets). No API call, no confirmation prompt.
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
    entityLabel: "ad set",
    summary: input.reason ?? "Applying bid amount changes (manual-bid ad sets only).",
    impactPreview: input.adjustments.map((a) => a.adSetId),
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

  const { metaService } = resolveSessionServices(sdkContext);

  const results: AdjustBidsResult[] = [];

  // Process adjustments sequentially to respect rate limits
  for (const adjustment of input.adjustments) {
    try {
      // Step 1: Read current ad set state
      const entity = await metaService.getEntity(
        "adSet",
        adjustment.adSetId,
        ["id", "name", "bid_amount", "bid_strategy"],
        context
      );

      const adSetName = entity.name;
      const previousBidAmount = entity.bid_amount != null ? entity.bid_amount : undefined;
      const bidStrategy = entity.bid_strategy;

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

  // Effect identity: scalar-only audit summary (counts), never raw bid values
  // beyond what the per-result list already reports.
  const effect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: {
      entity_label: "ad_set",
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
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `adjust_bids`. Validates the batch (positive
 * bid amounts, batch size) and projects the would-be effect — a bid adjustment
 * over N ad sets. Meta has no native validate/preview for bids, so both axes
 * are symbolic. Pure (no I/O).
 */
function buildAdjustBidsEffectDryRun(
  adjustments: AdjustBidsInput["adjustments"]
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  adjustments.forEach((a, i) => {
    if (!Number.isInteger(a.bidAmount) || a.bidAmount < 1) {
      validationErrors.push({
        code: "INVALID_BID_AMOUNT",
        message: `bidAmount must be a positive integer (cents) — got ${String(a.bidAmount)}`,
        field: `adjustments.${i}.bidAmount`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: { entity_label: "ad_set", requested: adjustments.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    "meta_adjust_bids",
    { requiresValidation: true, requiresSimulation: true }
  );
}

// ─── Response Formatter ─────────────────────────────────────────────

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
          `Dry run: adjusting bids on ${n} ad set(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No bids were changed.` +
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "adjust_bids",
      operation: ["adjust_bids"],
      // Effect-class: a bid mutation with no canonical entity snapshot. Entity
      // IDs are nested in `adjustments[]`, not top-level args.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "meta.adjust_bids.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. Meta has no
      // native bid validate/preview, so both axes are symbolic (honest true).
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
