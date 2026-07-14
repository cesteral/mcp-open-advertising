// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import {
  BulkOperationResultSchema,
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

const TOOL_NAME = "gads_bulk_create_entities";
const TOOL_TITLE = "Bulk Create Google Ads Entities";
const TOOL_DESCRIPTION = `Batch create multiple entities of the same type in a single API call.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Simpler alternative to \`gads_bulk_mutate\` when you only need to create entities.
Each item in \`items\` is the entity data object (same format as \`gads_create_entity\`).

- Max 50 items per call.
- Uses \`partialFailure: true\` so individual items can fail without aborting the batch.
- Returns per-item success/failure results.

**Important**: For campaigns, create campaignBudgets first and reference them via the \`campaignBudget\` field.`;

const EFFECT_KIND = "entities_created";

export const BulkCreateEntitiesInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to create"),
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    items: z
      .array(z.record(z.any()))
      .min(1)
      .max(50)
      .describe(
        "Array of entity data objects to create (max 50). Each object has the same shape as gads_create_entity data."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk create) without calling the Google Ads API. No entities are created."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for bulk entity creation");

export const BulkCreateEntitiesOutputSchema = z
  .object({
    results: z.array(BulkOperationResultSchema),
    successCount: z.number(),
    failureCount: z.number(),
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
  .describe("Bulk creation result");

type BulkCreateEntitiesInput = z.infer<typeof BulkCreateEntitiesInputSchema>;
type BulkCreateEntitiesOutput = z.infer<typeof BulkCreateEntitiesOutputSchema>;

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
      results: [],
      successCount: 0,
      failureCount: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Reuse the symbolic batch validator on the execute path: the dry-run
  // branch is opt-in, so without this an empty/degenerate item (Zod's
  // z.record admits {}) would otherwise reach the platform API.
  const preflight = buildBulkEffectDryRun(input);
  if (!preflight.wouldSucceed) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Invalid bulk create payload: ${preflight.validationErrors.map((e) => e.message).join("; ")}`
    );
  }

  const { gadsService } = resolveSessionServices(sdkContext);

  // Convert items to bulk mutate create operations
  const operations = input.items.map((item) => ({ create: item }));

  const apiResult = (await gadsService.bulkMutate(
    input.entityType as GAdsEntityType,
    input.customerId,
    operations,
    true, // partialFailure
    context
  )) as Record<string, unknown>;

  // Map API response to BulkOperationResult format
  const mutateResults = (apiResult?.results ?? []) as Array<Record<string, unknown>>;
  const partialErrors = (apiResult?.partialFailureError as Record<string, unknown>) ?? null;
  const errorDetails = (partialErrors?.details ?? []) as Array<Record<string, unknown>>;

  // Build a map of operation index → error message from partial failure details
  const errorsByIndex = new Map<number, string>();
  for (const detail of errorDetails) {
    const errors = (detail?.errors ?? []) as Array<Record<string, unknown>>;
    for (const err of errors) {
      const location = err?.location as Record<string, unknown> | undefined;
      const fieldPathElements = (location?.fieldPathElements ?? []) as Array<
        Record<string, unknown>
      >;
      // The first element with index indicates the operation index
      const opElement = fieldPathElements.find(
        (el) => el.fieldName === "operations" && el.index != null
      );
      const opIndex = opElement ? Number(opElement.index) : -1;
      const message =
        (err?.message as string) ??
        (err?.errorCode ? JSON.stringify(err.errorCode) : "Unknown error");
      if (opIndex >= 0) {
        errorsByIndex.set(opIndex, message);
      }
    }
  }

  const results = input.items.map((_item, index) => {
    const error = errorsByIndex.get(index);
    if (error) {
      return { success: false, error };
    }

    const mutateResult = mutateResults[index] as Record<string, unknown> | undefined;
    const resourceName =
      (mutateResult?.resourceName as string) ??
      // Some entity types nest the result (e.g., campaignBudgetResult.resourceName)
      extractResourceName(mutateResult);

    return {
      success: true,
      entity: resourceName ? { resourceName } : (mutateResult ?? {}),
    };
  });

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.items.length,
      succeeded: successCount,
      failed: failureCount,
      partial_success: successCount > 0 && failureCount > 0,
    },
  };

  return {
    results,
    successCount,
    failureCount,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Extract resourceName from nested result objects like
 * { campaignBudgetResult: { resourceName: "..." } }
 */
function extractResourceName(result: Record<string, unknown> | undefined): string | undefined {
  if (!result) return undefined;
  for (const value of Object.values(result)) {
    if (
      value &&
      typeof value === "object" &&
      "resourceName" in (value as Record<string, unknown>)
    ) {
      return (value as Record<string, unknown>).resourceName as string;
    }
  }
  return undefined;
}

/**
 * Symbolic effect dry-run for `bulk_create_entities`. Validates the batch
 * (every item must be a non-empty entity object — Zod's `z.record(z.any())`
 * admits `{}`) and projects the would-be effect (an N-item create of one
 * entity kind). Google Ads has no native bulk validate here, so both axes are
 * symbolic. Pure (no I/O).
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

export function bulkCreateEntitiesResponseFormatter(
  result: BulkCreateEntitiesOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const n = result.dryRun.expectedEffect?.summary.requested ?? 0;
    const kind = result.dryRun.expectedEffect?.summary.entity_kind ?? "entity";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: bulk-creating ${String(n)} ${String(kind)}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk create: ${result.successCount} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "bulk_create_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "google_ads.bulk_create_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create 2 campaign budgets",
      input: {
        entityType: "campaignBudget",
        customerId: "1234567890",
        items: [
          {
            name: "Q1 2025 Brand Budget",
            amountMicros: "50000000000",
            deliveryMethod: "STANDARD",
          },
          {
            name: "Q1 2025 Generic Budget",
            amountMicros: "30000000000",
            deliveryMethod: "STANDARD",
          },
        ],
      },
    },
  ],
  logic: bulkCreateEntitiesLogic,
  responseFormatter: bulkCreateEntitiesResponseFormatter,
};
