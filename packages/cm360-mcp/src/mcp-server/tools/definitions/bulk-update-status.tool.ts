// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import {
  McpError,
  JsonRpcErrorCode,
  elicitBulkStatusChangeConfirmation,
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

const TOOL_NAME = "cm360_bulk_update_status";
const TOOL_TITLE = "Bulk Update CM360 Entity Status";
const EFFECT_KIND = "entity_statuses_updated";
const TOOL_DESCRIPTION = `Batch update the status of multiple CM360 entities.

Each entity is fetched first then updated (CM360 uses PUT/replace semantics). Loops individual GET+PUT calls with rate limiting. At ~1 QPS, 50 items takes ~100 seconds.

Supported mappings:
- campaign: ACTIVE, ARCHIVED
- ad, creative: ACTIVE, ARCHIVED
- placement: ACTIVE, INACTIVE, ARCHIVED, PERMANENTLY_ARCHIVED`;

export const BulkUpdateStatusInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    entityIds: z.array(z.string().min(1)).min(1).max(50).describe("Entity IDs to update (max 50)"),
    status: z.string().min(1).describe("New status value (e.g., ARCHIVED, ACTIVE, PAUSED)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk status change) without prompting for confirmation or calling the CM360 API. No statuses are changed."
      ),
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    updated: z.number().describe("Number of entities updated"),
    failed: z.number().describe("Number of entities that failed"),
    results: z
      .array(
        z.object({
          entityId: z.string(),
          success: z.boolean(),
          error: z.string().optional(),
        })
      )
      .describe("Per-entity results"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No statuses were changed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entity_statuses_updated` + scalar batch audit summary incl. target_status). Present on a confirmed execute. A bulk status change is governed as a single batch effect — it carries no per-entity canonical snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `bulk_job` with `canonicalEntityKind: null` (effect class; the governed result is the batch effect, not one entity). Present on every response."
    ),
  })
  .describe("Bulk status update result");

type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkUpdateStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

export async function bulkUpdateStatusLogic(
  input: BulkUpdateStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkUpdateStatusOutput> {
  // Effect-class write: a bulk batch of N status changes is governed as a single
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

  const confirmed = await elicitBulkStatusChangeConfirmation({
    count: input.entityIds.length,
    entityLabel: input.entityType,
    targetStatus: input.status,
    impactPreview: input.entityIds,
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

  const entityType = input.entityType as CM360EntityType;
  const bulkResults = await cm360Service.bulkUpdateStatus(
    entityType,
    input.profileId,
    input.entityIds,
    input.status,
    (current, status) => applyStatusUpdate(entityType, current, status),
    context
  );

  let updated = 0;
  let failed = 0;
  const results: BulkUpdateStatusOutput["results"] = bulkResults.map((r) => {
    if (r.success) {
      updated++;
      return { entityId: r.entityId, success: true };
    }
    failed++;
    return { entityId: r.entityId, success: false, error: r.error };
  });

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityIds.length,
      succeeded: updated,
      failed,
      partial_success: updated > 0 && failed > 0,
      target_status: input.status,
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
 * Symbolic effect dry-run for `bulk_update_status`. Validates the batch (every
 * entity ID must be non-empty) and projects the would-be effect (an N-entity
 * status change to one target status). CM360 has no native bulk validate, so
 * both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkUpdateStatusInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.entityIds.forEach((id, i) => {
    if (!id || id.trim().length === 0) {
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
      requested: input.entityIds.length,
      target_status: input.status,
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

function applyStatusUpdate(
  entityType: CM360EntityType,
  current: Record<string, unknown>,
  requestedStatus: string
): Record<string, unknown> {
  const normalizedStatus = requestedStatus.toUpperCase();

  switch (entityType) {
    case "campaign":
      if (normalizedStatus === "ACTIVE") return { ...current, archived: false };
      if (normalizedStatus === "ARCHIVED") return { ...current, archived: true };
      break;
    case "ad":
    case "creative":
      if (normalizedStatus === "ACTIVE") return { ...current, active: true, archived: false };
      if (normalizedStatus === "ARCHIVED") return { ...current, active: false, archived: true };
      break;
    case "placement":
      if (normalizedStatus === "ACTIVE")
        return { ...current, activeStatus: "PLACEMENT_STATUS_ACTIVE" };
      if (normalizedStatus === "INACTIVE" || normalizedStatus === "PAUSED") {
        return { ...current, activeStatus: "PLACEMENT_STATUS_INACTIVE" };
      }
      if (normalizedStatus === "ARCHIVED")
        return { ...current, activeStatus: "PLACEMENT_STATUS_ARCHIVED" };
      if (normalizedStatus === "PERMANENTLY_ARCHIVED") {
        return { ...current, activeStatus: "PLACEMENT_STATUS_PERMANENTLY_ARCHIVED" };
      }
      break;
    default:
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Status updates are not supported for entity type: ${entityType}`
      );
  }

  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Unsupported status "${requestedStatus}" for entity type ${entityType}`
  );
}

export function bulkUpdateStatusResponseFormatter(
  result: BulkUpdateStatusOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const n = result.dryRun.expectedEffect?.summary.requested ?? 0;
    const status = result.dryRun.expectedEffect?.summary.target_status ?? "?";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: bulk status change of ${String(n)} entity(s) to ${String(status)} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No statuses were changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk status update cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const summary = `Bulk status update: ${result.updated} succeeded, ${result.failed} failed`;
  const details = result.results
    .filter((r) => !r.success)
    .map((r) => `  - ${r.entityId}: ${r.error}`)
    .join("\n");
  const failureDetails = details ? `\n\nFailures:\n${details}` : "";

  return [
    {
      type: "text" as const,
      text: `${summary}${failureDetails}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
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
      contractToolSlug: "bulk_update_status",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "cm360.bulk_update_status.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Archive multiple campaigns",
      input: {
        profileId: "123456",
        entityType: "campaign",
        entityIds: ["111", "222", "333"],
        status: "ARCHIVED",
      },
    },
    {
      label: "Set placements inactive",
      input: {
        profileId: "123456",
        entityType: "placement",
        entityIds: ["444", "555"],
        status: "INACTIVE",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
