// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { getEntitySchemaForOperation } from "../utils/entity-mapping-dynamic.js";
import { mergeIdsIntoData } from "../utils/parent-id-validation.js";
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
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_bulk_update_entities";
const TOOL_TITLE = "Bulk Update DV360 Entities";

const TOOL_DESCRIPTION =
  "Batch update up to 50 DV360 entities with updateMask discipline. " +
  "Loops through items individually (DV360 API has no native batch endpoint). " +
  "Returns partial success results — failed items do not block remaining updates. " +
  "Fetch entity-fields://{entityType} and entity-examples://{entityType} before calling.";

const EFFECT_KIND = "entities_updated";

/**
 * Input schema for bulk update entities tool
 */
export const BulkUpdateEntitiesInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe(
        "Type of entities to update. Fetch entity-fields://{entityType} for valid updateMask paths."
      ),
    advertiserId: z
      .string()
      .min(1)
      .describe("Advertiser ID (required for advertiser-scoped entities)"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("ID of the entity to update"),
          data: z.record(z.any()).describe("Partial payload containing only the fields to update"),
          updateMask: z
            .string()
            .min(1)
            .describe("Comma-separated field paths to update (e.g. displayName,entityStatus)"),
        })
      )
      .min(1)
      .max(50)
      .describe(
        "Array of update items (max 50). Each item specifies entityId, data payload, and updateMask."
      ),
    reason: z.string().optional().describe("Reason for bulk update (audit trail)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk update) without prompting for confirmation or calling the DV360 API. No entities are updated."
      ),
  })
  .describe("Parameters for bulk updating DV360 entities");

/**
 * Output schema for bulk update entities tool
 */
export const BulkUpdateEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    entityType: z.string().describe("Type of entities updated"),
    totalRequested: z.number().describe("Total items requested"),
    successCount: z.number().describe("Total items successfully updated"),
    failureCount: z.number().describe("Total items that failed"),
    results: z
      .array(
        BulkOperationResultSchema.extend({
          index: z.number().describe("Index of the item in the input array"),
          entityId: z.string().describe("Entity ID that was targeted"),
        })
      )
      .describe("Per-item results"),
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
  .describe("Bulk update entities result");

type BulkUpdateEntitiesInput = z.infer<typeof BulkUpdateEntitiesInputSchema>;
type BulkUpdateEntitiesOutput = z.infer<typeof BulkUpdateEntitiesOutputSchema>;

/**
 * Bulk update entities tool logic
 */
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
    summary: input.reason ?? "Applying field updates across multiple entities.",
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

  const { dv360Service } = resolveSessionServices(sdkContext);

  const results: BulkUpdateEntitiesOutput["results"] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];

    try {
      // Merge advertiserId and entity-specific ID into data
      const mergedData = mergeIdsIntoData(
        input.entityType,
        item.data as Record<string, unknown>,
        {
          advertiserId: input.advertiserId,
          [`${input.entityType}Id`]: item.entityId,
        } as Record<string, unknown>
      );

      // Build entityIds with advertiserId and the entity-specific ID
      const entityIds = extractEntityIds(
        {
          advertiserId: input.advertiserId,
          [`${input.entityType}Id`]: item.entityId,
        },
        input.entityType
      );

      const updated = await dv360Service.updateEntity(
        input.entityType,
        entityIds,
        mergedData,
        item.updateMask,
        context
      );

      results.push({
        index: i,
        entityId: item.entityId,
        success: true,
        entity: updated as Record<string, any>,
      });
      successCount++;
    } catch (error: any) {
      results.push({
        index: i,
        entityId: item.entityId,
        success: false,
        error: error.message || String(error),
      });
      failureCount++;
    }
  }

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
    confirmed: true,
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
 * Per-item validation for the dry-run, mirroring what the execute path sends to
 * DV360: the same `mergeIdsIntoData` + per-entity **update** schema
 * (`getEntitySchemaForOperation(entityType, "update")`) that `updateEntity`
 * enforces at execute (P4). Previously the dry-run checked only non-emptiness of
 * entityId/data/updateMask, so an approver could green-light a batch whose items
 * then fail the update schema per-item at execute. Structural checks
 * (entityId / updateMask presence) run first because they are not covered by the
 * data schema. Pure (no I/O).
 */
function validateBulkUpdateItem(
  input: BulkUpdateEntitiesInput,
  item: BulkUpdateEntitiesInput["items"][number],
  index: number
): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];

  if (!item.entityId || item.entityId.trim().length === 0) {
    errors.push({
      code: "INVALID_ENTITY_ID",
      message: `items[${index}].entityId must be a non-empty entity id`,
      field: `items.${index}.entityId`,
    });
  }
  if (!item.updateMask || item.updateMask.trim().length === 0) {
    errors.push({
      code: "EMPTY_UPDATE_MASK",
      message: `items[${index}].updateMask must list at least one field path`,
      field: `items.${index}.updateMask`,
    });
  }
  if (!item.data || typeof item.data !== "object" || Object.keys(item.data).length === 0) {
    errors.push({
      code: "EMPTY_UPDATE",
      message: `items[${index}].data must contain at least one field to update`,
      field: `items.${index}.data`,
    });
    // No data to schema-check — return the structural errors gathered so far.
    return errors;
  }

  // Mirror the execute path's field mapping + schema validation exactly.
  const merged = mergeIdsIntoData(
    input.entityType,
    item.data as Record<string, unknown>,
    {
      advertiserId: input.advertiserId,
      [`${input.entityType}Id`]: item.entityId,
    } as Record<string, unknown>
  );

  try {
    getEntitySchemaForOperation(input.entityType, "update").parse(merged);
  } catch (err: any) {
    if (err?.issues && Array.isArray(err.issues)) {
      for (const issue of err.issues) {
        const path = Array.isArray(issue.path) ? issue.path.join(".") : undefined;
        errors.push({
          code: issue.code ?? "ZOD",
          message: `items[${index}]${path ? "." + path : ""}: ${issue.message ?? String(err)}`,
          field: path ? `items.${index}.${path}` : `items.${index}`,
        });
      }
    } else {
      errors.push({
        code: "ZOD",
        message: `items[${index}]: ${err?.message ?? String(err)}`,
        field: `items.${index}`,
      });
    }
  }

  return errors;
}

/**
 * Symbolic effect dry-run for `bulk_update_entities`. Validates every item
 * against the per-entity update schema (the same one execute enforces) and
 * projects the would-be effect (an N-item update of one entity kind). DV360 has
 * no native bulk validate, so both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkUpdateEntitiesInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.items.forEach((item, i) => {
    validationErrors.push(...validateBulkUpdateItem(input, item, i));
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
        text: `Bulk update of ${result.totalRequested} ${result.entityType}(s) cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const summary = `Bulk update ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`;

  const successResults = result.results.filter((r) => r.success);
  const failedResults = result.results.filter((r) => !r.success);

  let responseText = summary;

  if (successResults.length > 0) {
    responseText += `\n\nSuccessful updates:\n${JSON.stringify(successResults, null, 2)}`;
  }

  if (failedResults.length > 0) {
    responseText += `\n\nFailed updates:\n${JSON.stringify(failedResults, null, 2)}`;
  }

  responseText +=
    "\n\nNote: Each item's updateMask determines which fields are written. " +
    "Fields not in the updateMask are left unchanged.";

  responseText += `\n\nTimestamp: ${result.timestamp}`;

  return [
    {
      type: "text" as const,
      text: responseText,
    },
  ];
}

/**
 * Bulk Update Entities Tool Definition
 */
export const bulkUpdateEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateEntitiesInputSchema,
  outputSchema: BulkUpdateEntitiesOutputSchema,
  inputExamples: [
    {
      label: "Bulk update line item bids and budgets",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        items: [
          {
            entityId: "5678901",
            data: {
              bidStrategy: {
                fixedBid: { bidAmountMicros: "6000000" },
              },
            },
            updateMask: "bidStrategy.fixedBid.bidAmountMicros",
          },
          {
            entityId: "5678902",
            data: {
              bidStrategy: {
                fixedBid: { bidAmountMicros: "4000000" },
              },
            },
            updateMask: "bidStrategy.fixedBid.bidAmountMicros",
          },
        ],
        reason: "Bid optimization — adjusting CPMs based on pacing",
      },
    },
    {
      label: "Bulk rename insertion orders",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        items: [
          {
            entityId: "4445551",
            data: { displayName: "IO - Display Prospecting (Updated)" },
            updateMask: "displayName",
          },
          {
            entityId: "4445552",
            data: { displayName: "IO - Video Retargeting (Updated)" },
            updateMask: "displayName",
          },
        ],
        reason: "Naming convention update",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "bulk_update_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "dv360.bulk_update_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
