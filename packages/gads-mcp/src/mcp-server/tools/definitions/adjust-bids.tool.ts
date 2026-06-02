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

const TOOL_NAME = "gads_adjust_bids";
const TOOL_TITLE = "Google Ads Bid Adjustment";
const TOOL_DESCRIPTION = `Batch adjust ad group bids with safe read-modify-write pattern.

For each ad group, the tool:
1. Reads the current ad group to capture previous bid values
2. Applies the new CPC and/or CPM bid amounts
3. Writes the update via the :mutate endpoint with a targeted updateMask

Returns both previous and new values for audit trail.

**Bid amounts are in micros** (1,000,000 = $1.00 USD). For example:
- $1.50 CPC = "1500000"
- $5.00 CPM = "5000000"

Up to 50 ad groups can be adjusted in a single call.

**Note:** Uses a read-modify-write pattern. Concurrent bid adjustments to the same ad group may cause one update to overwrite the other. Avoid adjusting the same ad group in parallel.`;

export const AdjustBidsInputSchema = z
  .object({
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    adjustments: z
      .array(
        z
          .object({
            adGroupId: z.string().min(1).describe("Ad group ID"),
            cpcBidMicros: z
              .string()
              .optional()
              .describe("New CPC bid in micros (1,000,000 = $1.00)"),
            cpmBidMicros: z
              .string()
              .optional()
              .describe("New CPM bid in micros (1,000,000 = $1.00)"),
          })
          .superRefine((adj, ctx) => {
            if (adj.cpcBidMicros === undefined && adj.cpmBidMicros === undefined) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "At least one of cpcBidMicros or cpmBidMicros must be provided",
              });
            }
          })
      )
      .min(1)
      .max(50)
      .describe("Array of bid adjustments (max 50)"),
    reason: z
      .string()
      .optional()
      .describe("Optional reason for the bid adjustment (for audit trail)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the bid adjustments and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bid-adjustment batch) without calling the Google Ads API or prompting for confirmation. No bids are changed."
      ),
  })
  .describe("Parameters for batch Google Ads bid adjustment");

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
        adGroupName: z.string().optional(),
        success: z.boolean(),
        previousCpcBidMicros: z.string().optional(),
        previousCpmBidMicros: z.string().optional(),
        newCpcBidMicros: z.string().optional(),
        newCpmBidMicros: z.string().optional(),
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
    summary: input.reason ?? "Applying CPC/CPM bid changes.",
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

  const { gadsService } = resolveSessionServices(sdkContext);

  const { results } = await gadsService.adjustBids(input.customerId, input.adjustments, context);

  const succeeded = results.filter((r) => r.success).length;

  const effect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: {
      entity_label: "ad_group",
      requested: input.adjustments.length,
      succeeded,
      failed: input.adjustments.length - succeeded,
    },
  };

  return {
    confirmed: true,
    totalRequested: input.adjustments.length,
    totalSucceeded: succeeded,
    totalFailed: input.adjustments.length - succeeded,
    results: results.map((r) => ({
      adGroupId: r.adGroupId,
      adGroupName: r.adGroupName,
      success: r.success,
      previousCpcBidMicros: r.previousCpcBidMicros,
      previousCpmBidMicros: r.previousCpmBidMicros,
      newCpcBidMicros: r.newCpcBidMicros,
      newCpmBidMicros: r.newCpmBidMicros,
      error: r.error,
    })),
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `adjust_bids`. Validates the batch (each present
 * CPC/CPM micros is a positive number) and projects the would-be effect — a bid
 * adjustment over N ad groups. Google Ads has no native bid validate/preview
 * wired here, so both axes are symbolic. Pure (no I/O).
 */
function buildAdjustBidsEffectDryRun(
  adjustments: AdjustBidsInput["adjustments"]
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  // Google Ads CPC/CPM bids are int64 **micros strings** on the wire — a
  // positive integer decimal string. The execute path forwards the string
  // verbatim to the `:mutate` API, so the dry-run must reject anything that is
  // not a valid positive int64 micros value (e.g. "1.5", "1e6", "-1", "0") to
  // avoid approving a mutation the API will reject.
  const isPositiveIntMicros = (s: string): boolean => {
    const t = s.trim();
    if (!/^\d+$/.test(t) || !/[1-9]/.test(t)) return false; // digits only, > 0
    try {
      // Guard the int64 upper bound (9223372036854775807).
      return BigInt(t) <= 9223372036854775807n;
    } catch {
      return false;
    }
  };
  adjustments.forEach((a, i) => {
    for (const [field, micros] of [
      ["cpcBidMicros", a.cpcBidMicros],
      ["cpmBidMicros", a.cpmBidMicros],
    ] as const) {
      if (micros !== undefined && !isPositiveIntMicros(micros)) {
        validationErrors.push({
          code: "INVALID_BID_MICROS",
          message: `${field} must be a positive int64 micros string (digits only, e.g. "1500000") — got ${String(micros)}`,
          field: `adjustments.${i}.${field}`,
        });
      }
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
    "gads_adjust_bids",
    { requiresValidation: true, requiresSimulation: true }
  );
}

function formatMicrosAsDollars(micros?: string): string {
  if (!micros) return "n/a";
  const num = Number(micros);
  if (isNaN(num)) return micros;
  return `$${(num / 1_000_000).toFixed(2)}`;
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
  const lines = result.results.map((r) => {
    if (r.success) {
      const parts: string[] = [];
      const name = r.adGroupName ? ` (${r.adGroupName})` : "";

      if (r.newCpcBidMicros !== undefined) {
        parts.push(
          `CPC ${formatMicrosAsDollars(r.previousCpcBidMicros)} -> ${formatMicrosAsDollars(r.newCpcBidMicros)}`
        );
      }

      if (r.newCpmBidMicros !== undefined) {
        parts.push(
          `CPM ${formatMicrosAsDollars(r.previousCpmBidMicros)} -> ${formatMicrosAsDollars(r.newCpmBidMicros)}`
        );
      }

      return `  + ${r.adGroupId}${name}: ${parts.join(", ")}`;
    }
    return `  x ${r.adGroupId}: ${r.error}`;
  });

  const summary = `Bid adjustments: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${lines.join("\n")}\n\nNote: Amounts in micros (1,000,000 = $1.00 USD)\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "adjust_bids",
      operation: ["adjust_bids"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "google_ads.adjust_bids.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Single CPC adjustment",
      input: {
        customerId: "1234567890",
        adjustments: [{ adGroupId: "111222333", cpcBidMicros: "1500000" }],
      },
    },
    {
      label: "Multiple adjustments with mixed bid types",
      input: {
        customerId: "1234567890",
        adjustments: [
          { adGroupId: "111", cpcBidMicros: "2000000" },
          { adGroupId: "222", cpmBidMicros: "5000000" },
        ],
        reason: "Increase bids to improve delivery pacing",
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
