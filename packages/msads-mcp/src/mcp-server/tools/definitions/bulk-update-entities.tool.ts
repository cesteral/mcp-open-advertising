// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import {
  elicitBulkMutationConfirmation,
  hasSensitiveBulkField,
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

const TOOL_NAME = "msads_bulk_update_entities";
const TOOL_TITLE = "Bulk Update Microsoft Ads Entities";
const TOOL_DESCRIPTION = `Batch update multiple Microsoft Advertising entities.

Each item must include the Id field. Only include fields you want to change.`;

const EFFECT_KIND = "entities_updated";

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    items: z
      .array(z.record(z.unknown()))
      .min(1)
      .describe("Array of entity data objects with Id and fields to update"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk update) without prompting for confirmation or calling the Microsoft Ads API. No entities are updated."
      ),
  })
  .describe("Parameters for bulk updating Microsoft Ads entities");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    results: z.array(z.record(z.any())),
    entityType: z.string(),
    totalItems: z.number(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were updated."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_updated` + scalar batch audit summary). Present on a confirmed execute. A bulk write is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
    ),
  })
  .describe("Bulk update result");

type BulkUpdateEntitiesInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateEntitiesOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateEntitiesOutput> {
  // Effect-class write: a bulk batch of N mutations is governed as a single
  // batch effect, not one canonical entity. Snapshot-level bulk governance is
  // deferred to a future `bulkEntity` contract (see project memory).
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the batch and project the would-be effect. No
  // confirmation prompt, no API call.
  if (input.dry_run === true) {
    const dryRun = buildBulkEffectDryRun(input);
    return {
      confirmed: true,
      results: [],
      entityType: input.entityType,
      totalItems: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // MSAds items are flat records (e.g. { Id: 123, DailyBudget: 100 }) — the
  // whole row IS the payload, no .data wrapper.
  const items = input.items as Array<Record<string, unknown>>;
  const confirmed = await elicitBulkMutationConfirmation({
    count: items.length,
    entityLabel: input.entityType,
    summary: "Applying field updates across multiple Microsoft Ads entities.",
    hasSensitiveFieldChange: hasSensitiveBulkField(items),
    impactPreview: items.map((it) => String(it.Id ?? it.id ?? "(unknown)")),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      results: [],
      entityType: input.entityType,
      totalItems: items.length,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { msadsService } = resolveSessionServices(sdkContext);

  const results = await msadsService.bulkUpdateEntities(
    input.entityType as MsAdsEntityType,
    input.items,
    context
  );

  // Microsoft Ads' bulk update returns raw batch results without a per-item
  // success flag, so the effect summary carries the requested count only.
  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_kind: input.entityType, requested: input.items.length },
  };

  return {
    confirmed: true,
    results: results as Record<string, unknown>[],
    entityType: input.entityType,
    totalItems: input.items.length,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_update_entities`. Validates the batch (every
 * item must be a non-empty record carrying an Id/id to target) and projects the
 * would-be effect (an N-item update of one entity kind). Microsoft Ads has no
 * native bulk validate, so both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkUpdateEntitiesInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.items.forEach((item, i) => {
    if (!item || typeof item !== "object" || Object.keys(item).length === 0) {
      validationErrors.push({
        code: "EMPTY_UPDATE",
        message: `items[${i}] must be a non-empty entity record`,
        field: `items.${i}`,
      });
      return;
    }
    const id = (item as Record<string, unknown>).Id ?? (item as Record<string, unknown>).id;
    if (id === undefined || id === null || String(id).trim().length === 0) {
      validationErrors.push({
        code: "MISSING_ID",
        message: `items[${i}] must include an Id to target for update`,
        field: `items.${i}.Id`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_kind: input.entityType, requested: input.items.length },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function bulkUpdateEntitiesResponseFormatter(
  result: BulkUpdateEntitiesOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const n = result.dryRun.expectedEffect?.summary.requested ?? 0;
    return [
      {
        type: "text" as const,
        text:
          `Dry run: bulk-updating ${String(n)} ${result.entityType}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were updated.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk update of ${result.totalItems} ${result.entityType} entities cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk updated ${result.totalItems} ${result.entityType} entities\n\nResults:\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateEntitiesInputSchema,
  outputSchema: BulkUpdateEntitiesOutputSchema,
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
      contractToolSlug: "bulk_update_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.bulk_update_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Bulk update campaign budgets",
      input: {
        entityType: "campaign",
        items: [
          { Id: 123, DailyBudget: 100.0 },
          { Id: 456, DailyBudget: 200.0 },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
