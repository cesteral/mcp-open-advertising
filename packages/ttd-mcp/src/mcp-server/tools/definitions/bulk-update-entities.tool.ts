// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getBulkEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue, mergeParentIdsIntoData } from "../utils/parent-id-validation.js";
import {
  BulkOperationResultSchema,
  elicitBulkMutationConfirmation,
  hasSensitiveBulkField,
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

const TOOL_NAME = "ttd_bulk_update_entities";
const TOOL_TITLE = "Bulk Update TTD Entities";
const TOOL_DESCRIPTION = `Update multiple The Trade Desk entities of the same type in a single batch operation.

**Supported entity types for bulk update:** ${getBulkEntityTypeEnum().join(", ")}

Provide an array of update items, each with an entityId and data payload. Uses TTD PUT semantics (full entity replacement). Partial failures are reported per-item.

**Important:** TTD uses PUT for updates — include ALL fields you want to keep, not just changed ones. Consider GETting each entity first to merge changes.`;

const EFFECT_KIND = "entities_updated";

export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getBulkEntityTypeEnum())
      .describe("Type of entities to update (campaign or adGroup)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID for all items (required for campaign/adGroup)"),
    campaignId: z.string().optional().describe("Campaign ID for all items (required for adGroup)"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("Entity ID to update"),
          data: z.record(z.any()).describe("Entity data fields to update"),
        })
      )
      .min(1)
      .max(50)
      .describe("Array of update items (max 50)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk update) without prompting for confirmation or calling the TTD API. No entities are updated."
      ),
  })
  .superRefine((input, ctx) => {
    input.items.forEach((item, index) => {
      addParentValidationIssue(
        ctx,
        input.entityType as TtdEntityType,
        input as Record<string, unknown>,
        item.data,
        ["items", index]
      );
    });
  })
  .describe("Parameters for bulk updating TTD entities");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    entityType: z.string(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(BulkOperationResultSchema),
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
  .describe("Bulk entity update results");

type BulkUpdateInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

export async function bulkUpdateEntitiesLogic(
  input: BulkUpdateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateOutput> {
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

  const payloads = input.items.map((it) => it.data ?? {});
  const confirmed = await elicitBulkMutationConfirmation({
    count: input.items.length,
    entityLabel: input.entityType,
    summary: "Applying field updates across multiple entities (TTD uses PUT semantics).",
    hasSensitiveFieldChange: hasSensitiveBulkField(payloads),
    impactPreview: input.items.map((it) => it.entityId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      entityType: input.entityType,
      totalRequested: input.items.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);
  const items = input.items.map((item) => ({
    ...item,
    data: mergeParentIdsIntoData(item.data, input as Record<string, unknown>),
  }));

  const { results } = await ttdService.bulkUpdateEntities(
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
    confirmed: true,
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
 * Symbolic effect dry-run for `bulk_update_entities`. Validates the batch (every
 * item must target a non-empty entityId and carry a non-empty data payload) and
 * projects the would-be effect (an N-item update of one entity kind). TTD has no
 * native bulk validate, so both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkUpdateInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.items.forEach((item, i) => {
    if (!item.entityId || item.entityId.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_ENTITY_ID",
        message: `items[${i}].entityId must be a non-empty entity ID`,
        field: `items.${i}.entityId`,
      });
    }
    if (!item.data || typeof item.data !== "object" || Object.keys(item.data).length === 0) {
      validationErrors.push({
        code: "EMPTY_UPDATE",
        message: `items[${i}].data must contain at least one field to update`,
        field: `items.${i}.data`,
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

export function bulkUpdateEntitiesResponseFormatter(result: BulkUpdateOutput): McpTextContent[] {
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
        text: `Bulk update of ${result.totalRequested} ${result.entityType}(s) cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk update ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "bulk_update_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.bulk_update_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update 2 ad groups with new bid CPMs",
      input: {
        entityType: "adGroup",
        advertiserId: "adv123abc",
        campaignId: "camp456def",
        items: [
          {
            entityId: "adg111aaa",
            data: {
              AdGroupName: "Prospecting - Display",
              RTBAttributes: {
                BudgetSettings: { DailyBudget: { Amount: 600, CurrencyCode: "USD" } },
                BaseBidCPM: { Amount: 4.0, CurrencyCode: "USD" },
              },
            },
          },
          {
            entityId: "adg222bbb",
            data: {
              AdGroupName: "Prospecting - Video",
              RTBAttributes: {
                BudgetSettings: { DailyBudget: { Amount: 1200, CurrencyCode: "USD" } },
                BaseBidCPM: { Amount: 9.5, CurrencyCode: "USD" },
              },
            },
          },
        ],
      },
    },
    {
      label: "Update 2 campaigns with new budgets",
      input: {
        entityType: "campaign",
        advertiserId: "adv123abc",
        items: [
          {
            entityId: "camp456def",
            data: {
              CampaignName: "Q1 Brand Awareness",
              Budget: { Amount: 75000, CurrencyCode: "USD" },
              StartDate: "2025-01-01T00:00:00Z",
              EndDate: "2025-03-31T23:59:59Z",
              PacingMode: "PaceAhead",
            },
          },
          {
            entityId: "camp789ghi",
            data: {
              CampaignName: "Q1 Retargeting",
              Budget: { Amount: 30000, CurrencyCode: "USD" },
              StartDate: "2025-01-01T00:00:00Z",
              EndDate: "2025-03-31T23:59:59Z",
              PacingMode: "PaceAhead",
            },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
