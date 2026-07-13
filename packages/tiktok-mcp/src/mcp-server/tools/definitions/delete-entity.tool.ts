// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
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

const TOOL_NAME = "tiktok_delete_entity";
const TOOL_TITLE = "Delete TikTok Ads Entity";
const TOOL_DESCRIPTION = `Delete one or more TikTok Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

TikTok delete uses a POST to the /delete/ endpoint with an array of entity IDs.
Deleted entities cannot be recovered. Consider using \`tiktok_bulk_update_status\` with DISABLE first.`;

const EFFECT_KIND = "entities_deleted";

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to delete"),
    advertiserId: z.string().min(1).describe("TikTok Advertiser ID"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to delete (max 20)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk delete) without prompting for confirmation or calling the TikTok API. No entities are deleted."
      ),
  })
  .describe("Parameters for deleting TikTok Ads entities");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    deleted: z.boolean(),
    entityType: z.string(),
    entityIds: z.array(z.string()),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were deleted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_deleted` + scalar batch audit summary). Present on a confirmed execute. A bulk delete is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Entity delete result");

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
      deleted: false,
      entityType: input.entityType,
      entityIds: input.entityIds,
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
      deleted: false,
      entityType: input.entityType,
      entityIds: input.entityIds,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  await tiktokService.deleteEntity(input.entityType as TikTokEntityType, input.entityIds, context);

  // The TikTok delete call is whole-batch: it resolves only when the batch was
  // accepted, so the effect is emitted with the full requested count.
  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityIds.length,
      succeeded: input.entityIds.length,
      failed: 0,
      partial_success: false,
    },
  };

  return {
    confirmed: true,
    deleted: true,
    entityType: input.entityType,
    entityIds: input.entityIds,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `delete_entity`. Validates every id is non-empty
 * and projects the would-be effect (an N-item delete of one entity kind).
 * TikTok has no native bulk validate, so both axes are symbolic. Pure.
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
        text: `Bulk deletion of ${result.entityIds.length} ${result.entityType}(s) cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `${result.entityType} entities deleted: ${result.entityIds.join(", ")}\n\nTimestamp: ${result.timestamp}`,
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
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "delete_entity",
      operation: ["bulk_job"],
      // Effect-class: a bulk delete batch is governed as one batch effect (no
      // canonical per-entity snapshot).
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "tiktok.delete_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Delete a single campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        entityIds: ["1800123456789"],
      },
    },
    {
      label: "Delete multiple ad groups",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        entityIds: ["1700111111111", "1700222222222"],
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
