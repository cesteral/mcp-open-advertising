// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope } from "@cesteral/shared";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import {
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

const TOOL_NAME = "tiktok_bulk_update_status";
const TOOL_TITLE = "TikTok Bulk Status Update";
const EFFECT_KIND = "entity_statuses_updated";
const TOOL_DESCRIPTION = `Batch update the status of TikTok Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Operation status values:**
- **ENABLE** — Activate entities
- **DISABLE** — Pause entities
- **DELETE** — Delete entities (irreversible)

TikTok's status update API accepts an array of IDs in a single request.`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entities to update"),
    advertiserId: z
      .string()
      .min(1)
      .describe(
        "TikTok Advertiser ID (informational — the session-bound advertiser from authentication is used for API calls)"
      ),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to update (max 20)"),
    operationStatus: z.enum(["ENABLE", "DISABLE", "DELETE"]).describe("Target status to apply"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk status change) without prompting for confirmation or calling the TikTok API. No statuses are changed."
      ),
  })
  .describe("Parameters for bulk status update of TikTok Ads entities");

export const BulkUpdateStatusOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    results: z.array(
      z.object({
        entityId: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
      })
    ),
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
      totalRequested: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitBulkStatusChangeConfirmation({
    count: input.entityIds.length,
    entityLabel: input.entityType,
    targetStatus: input.operationStatus,
    impactPreview: input.entityIds,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      totalRequested: input.entityIds.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { tiktokService, boundAdvertiserId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.advertiserId, boundAdvertiserId, "advertiserId");

  const result = await tiktokService.bulkUpdateStatus(
    input.entityType as TikTokEntityType,
    input.entityIds,
    input.operationStatus,
    context
  );

  const successCount = result.results.filter((r) => r.success).length;
  const failureCount = input.entityIds.length - successCount;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityIds.length,
      succeeded: successCount,
      failed: failureCount,
      partial_success: successCount > 0 && failureCount > 0,
      target_status: input.operationStatus,
    },
  };

  return {
    confirmed: true,
    totalRequested: input.entityIds.length,
    successCount,
    failureCount,
    results: result.results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_update_status`. Validates the batch (every
 * entity ID must be non-empty) and projects the would-be effect (an N-entity
 * status change to one target status). TikTok has no native bulk validate, so
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
      target_status: input.operationStatus,
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
  const lines: string[] = [
    `Status updates: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed`,
    "",
  ];

  for (const r of result.results) {
    if (r.success) {
      lines.push(`  ${r.entityId}: SUCCESS`);
    } else {
      lines.push(`  ${r.entityId}: FAILED - ${r.error}`);
    }
  }

  lines.push("", `Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "tiktok",
      contractPlatformSlug: "tiktok",
      contractToolSlug: "bulk_update_status",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "tiktok.bulk_update_status.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause multiple campaigns",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        entityIds: ["1800111111111", "1800222222222"],
        operationStatus: "DISABLE",
      },
    },
    {
      label: "Enable multiple ad groups",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        entityIds: ["1700111111111"],
        operationStatus: "ENABLE",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
