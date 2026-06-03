// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
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

const TOOL_NAME = "msads_adjust_bids";
const TOOL_TITLE = "Adjust Microsoft Ads Bids";
const TOOL_DESCRIPTION = `Batch adjust bids for Microsoft Advertising keywords or ad groups using a safe read-modify-write pattern.

Reads current entities, applies bid changes, and updates. This prevents overwriting other fields.`;

export const AdjustBidsInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Entity type (typically 'keyword' or 'adGroup')"),
    scope: z
      .object({
        campaignId: z
          .string()
          .optional()
          .describe("CampaignId required when adjusting ad group bids"),
        adGroupId: z.string().optional().describe("AdGroupId required when adjusting keyword bids"),
      })
      .optional()
      .describe(
        "Additional query context required by Microsoft Advertising read-before-write operations"
      ),
    adjustments: z
      .array(
        z.object({
          entityId: z.string().describe("Entity ID"),
          bidField: z.string().describe("Bid field name (e.g., Bid, CpcBid)"),
          newBid: z.number().positive().describe("New bid amount"),
        })
      )
      .min(1)
      .describe("Array of bid adjustments"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the bid adjustments and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bid-adjustment batch) without calling the Microsoft Advertising API or prompting for confirmation. No bids are changed."
      ),
  })
  .describe("Parameters for adjusting bids");

export const AdjustBidsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    result: z.record(z.any()),
    entityType: z.string(),
    adjustmentCount: z.number(),
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
  .describe("Bid adjustment result");

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
    const dryRun = buildAdjustBidsEffectDryRun(input.adjustments, input.entityType);
    return {
      confirmed: true,
      result: {},
      entityType: input.entityType,
      adjustmentCount: input.adjustments.length,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitBidChangeConfirmation({
    count: input.adjustments.length,
    entityLabel: input.entityType,
    summary: "Applying bid changes via read-modify-write.",
    impactPreview: input.adjustments.map((a) => a.entityId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      result: {},
      entityType: input.entityType,
      adjustmentCount: 0,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { msadsService } = resolveSessionServices(sdkContext);
  const queryParams: Record<string, unknown> = {};

  if (input.scope?.campaignId) {
    queryParams.CampaignId = Number(input.scope.campaignId);
  }
  if (input.scope?.adGroupId) {
    queryParams.AdGroupId = Number(input.scope.adGroupId);
  }

  const result = (await msadsService.adjustBids(
    input.entityType as MsAdsEntityType,
    input.adjustments,
    queryParams,
    context
  )) as Record<string, unknown>;

  const effect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: {
      entity_label: input.entityType,
      requested: input.adjustments.length,
    },
  };

  return {
    confirmed: true,
    result,
    entityType: input.entityType,
    adjustmentCount: input.adjustments.length,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `adjust_bids`. Validates the batch (each `newBid`
 * is a positive number) and projects the would-be effect — a bid adjustment
 * over N entities of `entityType`. Microsoft Advertising has no native bid
 * validate/preview wired here, so both axes are symbolic. Pure (no I/O).
 */
function buildAdjustBidsEffectDryRun(
  adjustments: AdjustBidsInput["adjustments"],
  entityType: string
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  adjustments.forEach((a, i) => {
    if (!Number.isFinite(a.newBid) || a.newBid <= 0) {
      validationErrors.push({
        code: "INVALID_BID_AMOUNT",
        message: `newBid must be a positive number — got ${String(a.newBid)}`,
        field: `adjustments.${i}.newBid`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: "bids_adjusted",
    summary: { entity_label: entityType, requested: adjustments.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    "msads_adjust_bids",
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function adjustBidsResponseFormatter(result: AdjustBidsOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const n = result.dryRun.expectedEffect?.summary.requested ?? result.adjustmentCount;
    return [
      {
        type: "text" as const,
        text:
          `Dry run: adjusting bids on ${n} ${result.entityType}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No bids were changed.` +
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
  return [
    {
      type: "text" as const,
      text: `Adjusted ${result.adjustmentCount} ${result.entityType} bids\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
    destructiveHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "adjust_bids",
      operation: ["adjust_bids"],
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.adjust_bids.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Adjust keyword bids",
      input: {
        entityType: "keyword",
        scope: { adGroupId: "333" },
        adjustments: [
          { entityId: "111", bidField: "Bid", newBid: 1.5 },
          { entityId: "222", bidField: "Bid", newBid: 2.0 },
        ],
      },
    },
  ],
  logic: adjustBidsLogic,
  responseFormatter: adjustBidsResponseFormatter,
};
