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

const TOOL_NAME = "linkedin_adjust_bids";
const TOOL_TITLE = "LinkedIn Ads Bid Adjustment";
const TOOL_DESCRIPTION = `Batch adjust campaign bid amounts.

Updates the \`unitCost\` (bid) for each campaign via PATCH.

**bid structure:** \`{ "amount": "10.00", "currencyCode": "USD" }\`

**Gotchas:**
- Only applies to campaigns with manual bidding (bidType: CPM, CPC, etc.).
- LOWEST_COST campaigns may ignore unitCost.
- Each adjustment consumes 3x rate limit tokens (write operation).
- Max 50 adjustments per call.`;

export const AdjustBidsInputSchema = z
  .object({
    adjustments: z
      .array(
        z.object({
          campaignUrn: z
            .string()
            .min(1)
            .describe("The campaign URN to adjust (e.g., urn:li:sponsoredCampaign:123)"),
          amount: z.string().describe('New bid amount as a decimal string (e.g., "10.00")'),
          currencyCode: z
            .string()
            .length(3)
            .describe("ISO 4217 currency code (e.g., USD, EUR, GBP)"),
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
        "When true, validates the bid adjustments and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bid-adjustment batch) without calling the LinkedIn API or prompting for confirmation. No bids are changed."
      ),
  })
  .describe("Parameters for batch bid adjustment on LinkedIn campaigns");

export const AdjustBidsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        campaignUrn: z.string(),
        success: z.boolean(),
        newAmount: z.string().optional(),
        currencyCode: z.string().optional(),
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

interface AdjustBidsResult {
  campaignUrn: string;
  success: boolean;
  newAmount?: string;
  currencyCode?: string;
  error?: string;
}

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
    entityLabel: "campaign",
    summary: input.reason ?? "Applying unitCost (bid) changes via PATCH.",
    impactPreview: input.adjustments.map((a) => a.campaignUrn),
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

  const { linkedInService } = resolveSessionServices(sdkContext);

  // Pass all adjustments to the service in one call
  const serviceResult = await linkedInService.adjustBids(
    input.adjustments.map((a) => ({
      campaignUrn: a.campaignUrn,
      bidAmount: {
        amount: a.amount,
        currencyCode: a.currencyCode,
      },
    })),
    context
  );

  const results: AdjustBidsResult[] = serviceResult.results.map((r, i) => ({
    campaignUrn: r.campaignUrn,
    success: r.success,
    newAmount: r.success ? input.adjustments[i].amount : undefined,
    currencyCode: r.success ? input.adjustments[i].currencyCode : undefined,
    error: r.error,
  }));

  const totalSucceeded = results.filter((r) => r.success).length;

  const effect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: {
      entity_label: "campaign",
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
 * Symbolic effect dry-run for `adjust_bids`. Validates the batch (each `amount`
 * parses to a positive number) and projects the would-be effect — a bid
 * adjustment over N campaigns. LinkedIn has no native bid validate/preview, so
 * both axes are symbolic. Pure (no I/O).
 */
function buildAdjustBidsEffectDryRun(
  adjustments: AdjustBidsInput["adjustments"]
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  adjustments.forEach((a, i) => {
    if (!Number.isFinite(Number(a.amount)) || Number(a.amount) <= 0) {
      validationErrors.push({
        code: "INVALID_BID_AMOUNT",
        message: `amount must be a positive decimal string — got ${String(a.amount)}`,
        field: `adjustments.${i}.amount`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: { entity_label: "campaign", requested: adjustments.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    "linkedin_adjust_bids",
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
          `Dry run: adjusting bids on ${n} campaign(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No bids were changed.` +
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
      lines.push(`  ${r.campaignUrn}: ${r.newAmount} ${r.currencyCode}`);
    } else {
      lines.push(`  ${r.campaignUrn}: FAILED - ${r.error}`);
    }
  }

  lines.push("");
  lines.push(`Timestamp: ${result.timestamp}`);

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
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
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "linkedin_ads",
      contractPlatformSlug: "linkedin_ads",
      contractToolSlug: "adjust_bids",
      operation: ["adjust_bids"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "linkedin_ads.adjust_bids.v1",
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
        adjustments: [
          {
            campaignUrn: "urn:li:sponsoredCampaign:123456789",
            amount: "12.00",
            currencyCode: "USD",
          },
        ],
      },
    },
    {
      label: "Multiple bid adjustments",
      input: {
        adjustments: [
          {
            campaignUrn: "urn:li:sponsoredCampaign:111111111",
            amount: "8.50",
            currencyCode: "USD",
          },
          {
            campaignUrn: "urn:li:sponsoredCampaign:222222222",
            amount: "15.00",
            currencyCode: "USD",
          },
        ],
        reason: "Increase bids to improve delivery",
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
