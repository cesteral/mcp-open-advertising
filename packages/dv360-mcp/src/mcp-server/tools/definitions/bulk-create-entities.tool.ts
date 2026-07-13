// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { extractParentIds } from "../utils/entity-id-extraction.js";
import { mergeIdsIntoData } from "../utils/parent-id-validation.js";
import {
  BulkOperationResultSchema,
  buildNextAction,
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

const TOOL_NAME = "dv360_bulk_create_entities";
const TOOL_TITLE = "Bulk Create DV360 Entities";

const TOOL_DESCRIPTION =
  "Batch create up to 50 DV360 entities of the same type. " +
  "Runs creates in parallel batches of up to 5 (DV360 API has no native batch endpoint). " +
  "Failed items do not block the remaining batch — partial success is returned. " +
  "Fetch entity-schema://{entityType} and entity-examples://{entityType} before calling.";

const EFFECT_KIND = "entities_created";

/**
 * Input schema for bulk create entities tool
 */
export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe(
        "Type of entities to create. Fetch entity-schema://{entityType} for required fields."
      ),
    advertiserId: z
      .string()
      .min(1)
      .describe("Advertiser ID (required for advertiser-scoped entities)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe(
        "Array of entity data payloads to create (max 50). " +
          "Each item follows the same schema as dv360_create_entity data field."
      ),
    reason: z.string().optional().describe("Reason for bulk creation (audit trail)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk create) without calling the DV360 API. No entities are created."
      ),
  })
  .describe("Parameters for bulk creating DV360 entities");

/**
 * Output schema for bulk create entities tool
 */
export const BulkCreateEntitiesOutputSchema = z
  .object({
    entityType: z.string().describe("Type of entities created"),
    totalRequested: z.number().describe("Total items requested"),
    successCount: z.number().describe("Total items successfully created"),
    failureCount: z.number().describe("Total items that failed"),
    results: z
      .array(
        BulkOperationResultSchema.extend({
          index: z.number().describe("Index of the item in the input array"),
          nextAction: z.string().optional().describe("Suggested recovery action for failed item"),
        })
      )
      .describe("Per-item results"),
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
  .describe("Bulk create entities result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

/**
 * Bulk create entities tool logic
 */
export async function bulkCreateEntitiesLogic(
  input: BulkCreateEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkCreateEntitiesOutput> {
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

  const { dv360Service } = resolveSessionServices(sdkContext);

  // Pre-process all items (merge IDs, extract parent IDs) before parallel execution
  const preparedItems = input.items.map((itemData) => ({
    entityIds: extractParentIds({ advertiserId: input.advertiserId }),
    mergedData: mergeIdsIntoData(
      input.entityType,
      itemData as Record<string, unknown>,
      { advertiserId: input.advertiserId } as Record<string, unknown>
    ),
  }));

  // Run creates in parallel with concurrency=5
  const bulkResults = await dv360Service.bulkCreateEntities(
    input.entityType,
    preparedItems,
    context
  );

  // Map bulk results back to the indexed result format callers depend on
  const results: BulkCreateEntitiesOutput["results"] = bulkResults.map((r, i) => ({
    index: i,
    success: r.success,
    ...(r.success ? { entity: r.entity as Record<string, any> } : {}),
    ...(r.error !== undefined ? { error: r.error } : {}),
    ...(!r.success
      ? {
          nextAction: buildNextAction({
            kind: "read-resource",
            uri: `entity-schema://${input.entityType}`,
            purpose: "required fields and enum values before retrying the failed item",
          }),
        }
      : {}),
  }));

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.items.length,
      succeeded: successCount,
      failed: failureCount,
      partial_success: successCount > 0 && failureCount > 0,
      // Record the operator-supplied audit reason into the governed effect
      // summary (finding M1) so it survives into the tool response / audit log.
      ...(input.reason ? { reason: input.reason } : {}),
    },
  };

  return {
    entityType: input.entityType,
    totalRequested: input.items.length,
    successCount,
    failureCount,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_create_entities`. Validates the batch
 * (every item must be a non-empty entity object — Zod's `z.record(z.any())`
 * admits `{}`) and projects the would-be effect (an N-item create of one
 * entity kind). DV360 has no native bulk validate, so both axes are symbolic.
 * Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkCreateEntitiesInput): EffectDryRunResult {
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

/**
 * Format response for MCP client
 */
export function bulkCreateEntitiesResponseFormatter(
  result: BulkCreateEntitiesOutput
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
          `Dry run: bulk-creating ${String(n)} ${result.entityType}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const summary = `Bulk create ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`;

  const successResults = result.results.filter((r) => r.success);
  const failedResults = result.results.filter((r) => !r.success);

  let responseText = summary;

  if (successResults.length > 0) {
    responseText += `\n\nSuccessful creates:\n${JSON.stringify(successResults, null, 2)}`;
  }

  if (failedResults.length > 0) {
    responseText += `\n\nFailed creates:\n${JSON.stringify(failedResults, null, 2)}`;
  }

  responseText += `\n\nTimestamp: ${result.timestamp}`;

  return [
    {
      type: "text" as const,
      text: responseText,
    },
  ];
}

/**
 * Bulk Create Entities Tool Definition
 */
export const bulkCreateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkCreateEntitiesInputSchema,
  outputSchema: BulkCreateEntitiesOutputSchema,
  inputExamples: [
    {
      label: "Bulk create line items",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        items: [
          {
            displayName: "LI - Display Prospecting",
            insertionOrderId: "9876543",
            entityStatus: "ENTITY_STATUS_DRAFT",
            lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
            budget: {
              budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC",
            },
            pacing: {
              pacingPeriod: "PACING_PERIOD_FLIGHT",
              pacingType: "PACING_TYPE_EVEN",
            },
            bidStrategy: {
              fixedBid: { bidAmountMicros: "5000000" },
            },
          },
          {
            displayName: "LI - Display Retargeting",
            insertionOrderId: "9876543",
            entityStatus: "ENTITY_STATUS_DRAFT",
            lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
            budget: {
              budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC",
            },
            pacing: {
              pacingPeriod: "PACING_PERIOD_FLIGHT",
              pacingType: "PACING_TYPE_EVEN",
            },
            bidStrategy: {
              fixedBid: { bidAmountMicros: "3000000" },
            },
          },
        ],
        reason: "Campaign launch — creating line items for Q1 flight",
      },
    },
    {
      label: "Bulk create campaigns",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        items: [
          {
            displayName: "Q1 2025 - Brand Awareness",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            campaignGoal: {
              campaignGoalType: "CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS",
              performanceGoal: {
                performanceGoalType: "PERFORMANCE_GOAL_TYPE_CPM",
                performanceGoalAmountMicros: "5000000",
              },
            },
            campaignFlight: {
              plannedSpendAmountMicros: "100000000000",
              plannedDates: { startDate: { year: 2025, month: 1, day: 15 } },
            },
          },
          {
            displayName: "Q1 2025 - Performance",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            campaignGoal: {
              campaignGoalType: "CAMPAIGN_GOAL_TYPE_DRIVE_ONLINE_ACTION",
              performanceGoal: {
                performanceGoalType: "PERFORMANCE_GOAL_TYPE_CPA",
                performanceGoalAmountMicros: "10000000",
              },
            },
            campaignFlight: {
              plannedSpendAmountMicros: "200000000000",
              plannedDates: { startDate: { year: 2025, month: 1, day: 15 } },
            },
          },
        ],
        reason: "New advertiser onboarding — creating Q1 campaigns",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "bulk_create_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "dv360.bulk_create_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
