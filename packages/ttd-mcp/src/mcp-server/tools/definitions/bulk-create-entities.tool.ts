// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getBulkEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue, mergeParentIdsIntoData } from "../utils/parent-id-validation.js";
import {
  BulkOperationResultSchema,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "ttd_bulk_create_entities";
const TOOL_TITLE = "Bulk Create TTD Entities";
const TOOL_DESCRIPTION = `Create multiple The Trade Desk entities of the same type in a single batch operation.

**Supported entity types for bulk create:** ${getBulkEntityTypeEnum().join(", ")}

Provide an array of entity data objects. Each item is created independently — partial failures are possible and reported per-item.`;

const EFFECT_KIND = "entities_created";

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getBulkEntityTypeEnum())
      .describe("Type of entities to create (campaign or adGroup)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID for all items (required for campaign/adGroup)"),
    campaignId: z.string().optional().describe("Campaign ID for all items (required for adGroup)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe("Array of entity data objects to create (max 50)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk create) without calling the TTD API. No entities are created."
      ),
  })
  .superRefine((input, ctx) => {
    input.items.forEach((item, index) => {
      addParentValidationIssue(
        ctx,
        input.entityType as TtdEntityType,
        input as Record<string, unknown>,
        item,
        ["items", index]
      );
    });
  })
  .describe("Parameters for bulk creating TTD entities");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    entityType: z.string(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(BulkOperationResultSchema),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_created` + scalar batch audit summary). Present on a confirmed execute. A bulk write is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
    ),
  })
  .describe("Bulk entity creation results");

type BulkCreateInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

export async function bulkCreateEntitiesLogic(
  input: BulkCreateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateOutput> {
  // Effect-class write: a bulk batch of N mutations is governed as a single
  // batch effect, not one canonical entity. Snapshot-level bulk governance is
  // deferred to a future `bulkEntity` contract (see project memory).
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the batch and project the would-be effect. No API call.
  if (input.dry_run === true) {
    const dryRun = buildBulkEffectDryRun(input);
    return {
      entityType: input.entityType,
      totalRequested: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);
  const items = input.items.map((item) =>
    mergeParentIdsIntoData(item, input as Record<string, unknown>)
  );

  const { results } = await ttdService.bulkCreateEntities(
    input.entityType as TtdEntityType,
    items,
    context
  );

  const succeeded = results.filter((r) => r.success).length;
  const failureCount = items.length - succeeded;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: items.length,
      succeeded,
      failed: failureCount,
      partial_success: succeeded > 0 && failureCount > 0,
    },
  };

  return {
    entityType: input.entityType,
    totalRequested: items.length,
    successCount: succeeded,
    failureCount,
    results: results.map((r) => ({
      success: r.success,
      entity: r.entity as Record<string, any> | undefined,
      error: r.error,
    })),
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_create_entities`. Validates the batch
 * (every item must be a non-empty entity object — Zod's `z.record(z.any())`
 * admits `{}`) and projects the would-be effect (an N-item create of one
 * entity kind). TTD has no native bulk validate, so both axes are symbolic.
 * Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkCreateInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.items.forEach((item, i) => {
    if (!item || typeof item !== "object" || Object.keys(item).length === 0) {
      validationErrors.push({
        code: "EMPTY_ITEM",
        message: `items[${i}] must be a non-empty entity object`,
        field: `items.${i}`,
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

export function bulkCreateEntitiesResponseFormatter(result: BulkCreateOutput): McpTextContent[] {
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
          `Dry run: bulk-creating ${String(n)} ${result.entityType}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk create ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkCreateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkCreateEntitiesInputSchema,
  outputSchema: BulkCreateEntitiesOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "bulk_create_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.bulk_create_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create 2 campaigns in one call",
      input: {
        entityType: "campaign",
        advertiserId: "adv123abc",
        items: [
          {
            CampaignName: "Q1 Brand Awareness",
            Budget: { Amount: 50000, CurrencyCode: "USD" },
            StartDate: "2025-01-01T00:00:00Z",
            EndDate: "2025-03-31T23:59:59Z",
            PacingMode: "PaceAhead",
          },
          {
            CampaignName: "Q1 Retargeting",
            Budget: { Amount: 20000, CurrencyCode: "USD" },
            StartDate: "2025-01-01T00:00:00Z",
            EndDate: "2025-03-31T23:59:59Z",
            PacingMode: "PaceAhead",
          },
        ],
      },
    },
    {
      label: "Create 2 ad groups under a campaign",
      input: {
        entityType: "adGroup",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        items: [
          {
            AdGroupName: "Prospecting - Display",
            RTBAttributes: {
              BudgetSettings: { DailyBudget: { Amount: 500, CurrencyCode: "USD" } },
              BaseBidCPM: { Amount: 3.5, CurrencyCode: "USD" },
            },
          },
          {
            AdGroupName: "Prospecting - Video",
            RTBAttributes: {
              BudgetSettings: { DailyBudget: { Amount: 1000, CurrencyCode: "USD" } },
              BaseBidCPM: { Amount: 8.0, CurrencyCode: "USD" },
            },
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
