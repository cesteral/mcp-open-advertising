// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import {
  elicitBulkDeleteConfirmation,
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

const TOOL_NAME = "msads_delete_entity";
const TOOL_TITLE = "Delete Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Delete one or more Microsoft Advertising entities by their IDs.

This is a destructive operation — entities will be permanently deleted.`;

const EFFECT_KIND = "entities_deleted";

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to delete"),
    entityIds: z.array(z.string()).min(1).describe("Array of entity IDs to delete"),
    additionalParams: z
      .record(z.unknown())
      .optional()
      .describe("Additional parameters (e.g., AccountId)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk delete) without prompting for confirmation or calling the Microsoft Ads API. No entities are deleted."
      ),
  })
  .describe("Parameters for deleting Microsoft Ads entities");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    result: z.record(z.any()),
    entityType: z.string(),
    deletedCount: z
      .number()
      .describe("Number of ids Microsoft Ads accepted (requested − PartialErrors)"),
    failedCount: z.number().describe("Number of ids Microsoft Ads rejected via PartialErrors"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were deleted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_deleted` + scalar batch audit summary with requested/succeeded/failed counts derived from the Microsoft Ads PartialErrors). Present on a confirmed execute. A bulk delete is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  // Effect-class write: a bulk delete batch is governed as one batch effect, not
  // one canonical entity. Snapshot-level bulk governance is a future contract.
  const dispatchedCapability: DispatchedCapability = {
    operation: "bulk_job",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    const dryRun = buildBulkEffectDryRun(input);
    return {
      confirmed: true,
      result: {},
      entityType: input.entityType,
      deletedCount: 0,
      failedCount: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitBulkDeleteConfirmation({
    count: input.entityIds.length,
    entityLabel: input.entityType,
    impactPreview: input.entityIds,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      result: {},
      entityType: input.entityType,
      deletedCount: 0,
      failedCount: 0,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.deleteEntity(
    input.entityType as MsAdsEntityType,
    input.entityIds,
    input.additionalParams,
    context
  )) as Record<string, unknown>;

  // Microsoft Ads delete is a single batch call that returns HTTP 200 even when
  // some ids fail — the per-item failures arrive as `PartialErrors[].Index`. Count
  // them so the effect reports the real outcome rather than blanket success.
  const requested = input.entityIds.length;
  const failedCount = countMsAdsPartialFailures(result, requested);
  const succeeded = requested - failedCount;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested,
      succeeded,
      failed: failedCount,
      partial_success: succeeded > 0 && failedCount > 0,
    },
  };

  return {
    confirmed: true,
    result,
    entityType: input.entityType,
    deletedCount: succeeded,
    failedCount,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Count distinct request items the Microsoft Ads delete rejected. The JSON
 * Campaign Management API returns HTTP 200 with a top-level `PartialErrors`
 * array; each entry's `Index` points at the failed request item. Defensive: only
 * indices within the requested range are counted.
 */
function countMsAdsPartialFailures(result: unknown, requested: number): number {
  if (!result || typeof result !== "object") return 0;
  const partialErrors = (result as Record<string, unknown>).PartialErrors;
  if (!Array.isArray(partialErrors)) return 0;
  const failedIndices = new Set<number>();
  for (const entry of partialErrors) {
    const index = (entry as Record<string, unknown>)?.Index;
    if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < requested) {
      failedIndices.add(index);
    }
  }
  return failedIndices.size;
}

/**
 * Symbolic effect dry-run for `delete_entity`. Validates every id is non-empty
 * and projects the would-be effect (an N-item delete of one entity kind).
 * Microsoft Ads has no native bulk validate, so both axes are symbolic. Pure.
 */
function buildBulkEffectDryRun(input: DeleteEntityInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.entityIds.forEach((entityId, i) => {
    if (!entityId || entityId.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_ENTITY_ID",
        message: `entityIds[${i}] must be a non-empty entity ID`,
        field: `entityIds.${i}`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { entity_kind: input.entityType, requested: input.entityIds.length },
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

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
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
          `Dry run: bulk-deleting ${String(n)} ${String(kind)}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were deleted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk deletion of ${result.entityType} entities cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const total = result.deletedCount + result.failedCount;
  const failedNote =
    result.failedCount > 0 ? ` (${result.failedCount} rejected via PartialErrors)` : "";
  return [
    {
      type: "text" as const,
      text: `Deleted ${result.deletedCount}/${total} ${result.entityType} entities${failedNote}\n\nResult:\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "msads",
      contractPlatformSlug: "msads",
      contractToolSlug: "delete_entity",
      operation: ["bulk_job"],
      // Effect-class: a bulk delete batch is governed as one batch effect (no
      // canonical per-entity snapshot).
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "msads.delete_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Delete campaigns",
      input: { entityType: "campaign", entityIds: ["123456", "789012"] },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
