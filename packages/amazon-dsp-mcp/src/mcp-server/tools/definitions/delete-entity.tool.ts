// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
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

const TOOL_NAME = "amazon_dsp_delete_entity";
const TOOL_TITLE = "Delete AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Archive one or more Amazon DSP entities (equivalent to deletion).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Amazon DSP has no DELETE endpoint. Archiving sets state to ARCHIVED via PUT.
Archived entities cannot be recovered. Consider using \`amazon_dsp_bulk_update_status\` with PAUSED first.`;

const EFFECT_KIND = "entities_deleted";

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to delete"),
    profileId: z.string().min(1).describe("AmazonDsp Advertiser ID"),
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
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk archive) without prompting for confirmation or calling the Amazon DSP API. No entities are archived."
      ),
  })
  .describe("Parameters for deleting AmazonDsp Ads entities");

export const DeleteEntityOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    entityType: z.string(),
    totalRequested: z.number(),
    totalSucceeded: z.number(),
    totalFailed: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No entities were archived."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entities_deleted` + scalar batch audit summary). Present on a confirmed execute. A bulk delete is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
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
  // Effect-class write: a bulk batch of N deletions is governed as a single
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
      totalSucceeded: 0,
      totalFailed: 0,
      results: [],
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
      entityType: input.entityType,
      totalRequested: input.entityIds.length,
      totalSucceeded: 0,
      totalFailed: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { amazonDspService, boundProfileId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.profileId, boundProfileId, "profileId");

  const results: Array<{ entityId: string; success: boolean; error?: string }> = [];

  // Archive each entity individually (Amazon DSP has no bulk delete endpoint)
  for (const entityId of input.entityIds) {
    try {
      await amazonDspService.deleteEntity(
        input.entityType as AmazonDspEntityType,
        entityId,
        context
      );
      results.push({ entityId, success: true });
    } catch (error) {
      results.push({
        entityId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totalSucceeded = results.filter((r) => r.success).length;
  const totalFailed = input.entityIds.length - totalSucceeded;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityIds.length,
      succeeded: totalSucceeded,
      failed: totalFailed,
      partial_success: totalSucceeded > 0 && totalFailed > 0,
    },
  };

  return {
    confirmed: true,
    entityType: input.entityType,
    totalRequested: input.entityIds.length,
    totalSucceeded,
    totalFailed,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `delete_entity`. Validates the batch (every id must
 * be a non-empty entity id) and projects the would-be effect (an N-item archive
 * of one entity kind). Amazon DSP has no native bulk validate, so both axes are
 * symbolic. Pure (no I/O).
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
          `Dry run: bulk-archiving ${String(n)} ${String(kind)}(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No entities were archived.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk archive of ${result.totalRequested} ${result.entityType}(s) cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const lines: string[] = [
    `${result.entityType} deletions: ${result.totalSucceeded}/${result.totalRequested} succeeded, ${result.totalFailed} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  ${r.entityId}: archived`);
    } else {
      lines.push(`  ${r.entityId}: FAILED - ${r.error}`);
    }
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
      platform: "amazon_dsp",
      contractPlatformSlug: "amazon_dsp",
      contractToolSlug: "delete_entity",
      operation: ["bulk_job"],
      // Effect-class: a bulk delete batch is governed as one batch effect (no
      // canonical per-entity snapshot). Snapshot-level bulk governance is a future
      // bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "amazon_dsp.delete_entity.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Archive a single order (campaign)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        entityIds: ["ord_123456789"],
      },
    },
    {
      label: "Archive multiple line items",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        entityIds: ["li_111111", "li_222222"],
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
