// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertPinterestBulkCapacity,
  pinterestBulkBuckets,
  pinterestBulkCapacityDryRunErrors,
} from "../utils/bulk-capacity.js";
import {
  getEntityConfig,
  getEntityTypeEnum,
  type PinterestEntityType,
} from "../utils/entity-mapping.js";
import {
  elicitBulkDeleteConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
  assertAccountScope,
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

const TOOL_NAME = "pinterest_delete_entity";
const TOOL_TITLE = "Delete or Archive Pinterest Ads Entities";
const TOOL_DESCRIPTION = `Remove one or more Pinterest Ads entities. For campaign, adGroup and ad this ARCHIVES them; only creative (Pin) is truly deleted.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

- **campaign / adGroup / ad → archived.** Pinterest API v5 has no DELETE for these, so each id is PATCHed to \`status: "ARCHIVED"\`. The entity still exists (visible with status ARCHIVED) but stops delivering. No tool on this server un-archives it; treat it as permanent.
- **creative (Pin) → deleted** with \`DELETE /v5/pins/{pin_id}\`. This cannot be undone.

Results are reported per id. Consider \`pinterest_bulk_update_status\` with PAUSED first if you may want the entities back.`;

const EFFECT_KIND = "entities_deleted";

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to delete"),
    adAccountId: z.string().min(1).describe("Pinterest Advertiser ID"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to remove (max 20)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk archive/delete) without prompting for confirmation or calling the Pinterest API. Nothing is archived or deleted."
      ),
  })
  .describe("Parameters for deleting Pinterest Ads entities");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    deleted: z
      .boolean()
      .describe(
        "True only when every requested id was removed — archived (campaign/adGroup/ad) or deleted (creative); see `removal`."
      ),
    removal: z
      .enum(["archived", "deleted"])
      .describe(
        "How Pinterest removed these entities: `archived` (status set to ARCHIVED; the entity still exists) for campaign/adGroup/ad, `deleted` for creative (Pin)."
      ),
    entityType: z.string(),
    entityIds: z.array(z.string()),
    succeededCount: z.number().describe("Number of ids Pinterest confirmed archived/deleted"),
    failedCount: z.number().describe("Number of ids whose archive/delete request failed"),
    results: z
      .array(
        z.object({
          entityId: z.string(),
          success: z.boolean(),
          error: z.string().optional(),
        })
      )
      .describe(
        "Per-id outcome (one Pinterest request per id: an ARCHIVED status PATCH, or a Pin DELETE)"
      ),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was archived or deleted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_deleted` + scalar batch audit summary with `removal` (archived|deleted) and requested/succeeded/failed counts). Present on a confirmed execute. A bulk removal is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Entity delete result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

/** How Pinterest v5 removes an entity type: archive (status PATCH) or a real DELETE. */
function removalFor(entityType: string): "archived" | "deleted" {
  return getEntityConfig(entityType as PinterestEntityType).removal === "archive"
    ? "archived"
    : "deleted";
}

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

  const removal = removalFor(input.entityType);

  if (input.dry_run === true) {
    const dryRun = buildBulkEffectDryRun(
      input,
      pinterestBulkCapacityDryRunErrors(
        TOOL_NAME,
        input.entityIds.length,
        pinterestBulkBuckets.delete(input.adAccountId, input.entityType),
        "entityIds"
      )
    );
    return {
      confirmed: true,
      deleted: false,
      removal,
      entityType: input.entityType,
      entityIds: input.entityIds,
      succeededCount: 0,
      failedCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Refuse a batch the rate limiter cannot admit within its queue budget
  // BEFORE the confirmation prompt and the first archive/delete.
  assertPinterestBulkCapacity(
    TOOL_NAME,
    input.entityIds.length,
    pinterestBulkBuckets.delete(input.adAccountId, input.entityType)
  );

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
      removal,
      entityType: input.entityType,
      entityIds: input.entityIds,
      succeededCount: 0,
      failedCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { pinterestService, boundAdAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.adAccountId, boundAdAccountId, "adAccountId");

  // The service reports per-id outcomes: one ARCHIVED status PATCH per id for
  // campaign/adGroup/ad (Pinterest v5 has no DELETE for them), one
  // DELETE /v5/pins/{id} per id for creative.
  const { results } = await pinterestService.deleteEntity(
    input.entityType as PinterestEntityType,
    { adAccountId: input.adAccountId },
    input.entityIds,
    context
  );
  const succeededCount = results.filter((r) => r.success).length;
  const failedCount = results.length - succeededCount;

  // Batch effect carries the real per-id outcome counts.
  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      removal,
      requested: input.entityIds.length,
      succeeded: succeededCount,
      failed: failedCount,
      partial_success: succeededCount > 0 && failedCount > 0,
    },
  };

  return {
    confirmed: true,
    deleted: failedCount === 0,
    removal,
    entityType: input.entityType,
    entityIds: input.entityIds,
    succeededCount,
    failedCount,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `delete_entity`. Validates every id is non-empty
 * and projects the would-be effect (an N-item archive/delete of one entity kind).
 * Pinterest has no native bulk validate, so both axes are symbolic. Pure.
 */
function buildBulkEffectDryRun(
  input: DeleteEntityInput,
  capacityErrors: DryRunValidationError[] = []
): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [...capacityErrors];
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
    summary: {
      entity_kind: input.entityType,
      removal: removalFor(input.entityType),
      requested: input.entityIds.length,
    },
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
    const verb = result.removal === "archived" ? "archiving" : "deleting";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: ${verb} ${String(n)} ${String(kind)}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was archived or deleted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Removal (${result.removal === "archived" ? "archive" : "delete"}) of ${result.entityIds.length} ${result.entityType}(s) cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const lines: string[] = [
    `${result.entityType} ${result.removal === "archived" ? "archives (status ARCHIVED — the entities still exist)" : "deletions"}: ${result.succeededCount}/${result.entityIds.length} succeeded, ${result.failedCount} failed`,
    "",
  ];
  for (const r of result.results) {
    lines.push(
      r.success ? `  ${r.entityId}: ${result.removal}` : `  ${r.entityId}: FAILED - ${r.error}`
    );
  }
  lines.push("", `Timestamp: ${result.timestamp}`);
  return [{ type: "text" as const, text: lines.join("\n") }];
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
      platform: "pinterest",
      contractPlatformSlug: "pinterest",
      contractToolSlug: "delete_entity",
      operation: ["bulk_job"],
      // Effect-class: a bulk removal batch (ARCHIVED status PATCH for
      // campaign/adGroup/ad, DELETE for Pins) is governed as one batch effect
      // (no canonical per-entity snapshot). Terminal either way: nothing on
      // this server un-archives.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "pinterest.delete_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Archive a single campaign",
      input: {
        entityType: "campaign",
        adAccountId: "1234567890",
        entityIds: ["1800123456789"],
      },
    },
    {
      label: "Archive multiple ad groups",
      input: {
        entityType: "adGroup",
        adAccountId: "1234567890",
        entityIds: ["1700111111111", "1700222222222"],
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
  // The dry run does not read the entities; only per-id platform error messages carry platform text.
  untrustedContent: {
    structuredPaths: ["$.results"],
    contentBlocks: [0],
  },
};
