// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
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

const TOOL_NAME = "cm360_bulk_update_entities";
const TOOL_TITLE = "Bulk Update CM360 Entities";
const TOOL_DESCRIPTION = `Batch update multiple CM360 entities of the same type.

Each item must include the id field (CM360 uses PUT/replace semantics). Loops individual update calls with rate limiting. Max 50 items per call.`;

const EFFECT_KIND = "entities_updated";

export const BulkUpdateEntitiesInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    items: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("Entity ID to update"),
          data: z.record(z.any()).describe("Full entity data including id field"),
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
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk update) without prompting for confirmation or calling the CM360 API. No entities are updated."
      ),
  })
  .describe("Parameters for bulk entity update");

export const BulkUpdateEntitiesOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    updated: z.number().describe("Number of entities updated"),
    failed: z.number().describe("Number that failed"),
    results: z
      .array(
        z.object({
          entityId: z.string(),
          success: z.boolean(),
          entity: z.record(z.any()).optional(),
          error: z.string().optional(),
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
      updated: 0,
      failed: 0,
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
    summary: "Applying field updates across multiple CM360 entities (PUT/replace semantics).",
    hasSensitiveFieldChange: hasSensitiveBulkField(payloads),
    impactPreview: input.items.map((it) => it.entityId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      updated: 0,
      failed: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { cm360Service } = resolveSessionServices(sdkContext);

  const bulkResults = await cm360Service.bulkUpdateEntities(
    input.entityType as CM360EntityType,
    input.profileId,
    input.items,
    context
  );

  let updated = 0;
  let failed = 0;
  const results: BulkUpdateEntitiesOutput["results"] = bulkResults.map((r) => {
    if (r.success) {
      updated++;
      return {
        entityId: r.entityId,
        success: true,
        entity: r.entity as unknown as Record<string, any>,
      };
    }
    failed++;
    return { entityId: r.entityId, success: false, error: r.error };
  });

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.items.length,
      succeeded: updated,
      failed,
      partial_success: updated > 0 && failed > 0,
    },
  };

  return {
    confirmed: true,
    updated,
    failed,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_update_entities`. Validates the batch (every
 * item must target a non-empty entityId and carry a non-empty data payload) and
 * projects the would-be effect (an N-item update of one entity kind). CM360 has
 * no native bulk validate, so both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkUpdateEntitiesInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.items.forEach((item, i) => {
    if (!item.entityId || item.entityId.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_ENTITY_ID",
        message: `items[${i}].entityId must be a non-empty entity id`,
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

export function bulkUpdateEntitiesResponseFormatter(
  result: BulkUpdateEntitiesOutput
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
          `Dry run: bulk-updating ${String(n)} ${String(kind)}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were updated.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk update cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const summary = `Bulk update: ${result.updated} succeeded, ${result.failed} failed`;
  const failures = result.results
    .filter((r) => !r.success)
    .map((r) => `  - ${r.entityId}: ${r.error}`)
    .join("\n");
  const failureDetails = failures ? `\n\nFailures:\n${failures}` : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${failureDetails}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "cm360",
      contractPlatformSlug: "cm360",
      contractToolSlug: "bulk_update_entities",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "cm360.bulk_update_entities.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update multiple campaign names",
      input: {
        profileId: "123456",
        entityType: "campaign",
        items: [
          {
            entityId: "111",
            data: { id: "111", name: "Campaign A - Updated", advertiserId: "789" },
          },
          {
            entityId: "222",
            data: { id: "222", name: "Campaign B - Updated", advertiserId: "789" },
          },
        ],
      },
    },
  ],
  logic: bulkUpdateEntitiesLogic,
  responseFormatter: bulkUpdateEntitiesResponseFormatter,
};
