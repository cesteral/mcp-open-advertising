// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getStatusCapableEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
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

const TOOL_NAME = "gads_bulk_update_status";
const TOOL_TITLE = "Bulk Update Google Ads Entity Status";
const EFFECT_KIND = "entity_statuses_updated";
const TOOL_DESCRIPTION = `Batch update the status for multiple Google Ads entities of the same type.

**Supported entity types:** ${getStatusCapableEntityTypeEnum().join(", ")}

**Available statuses:**
- \`ENABLED\` — active and eligible for delivery
- \`PAUSED\` — temporarily stopped (can be re-enabled)
- \`REMOVED\` — permanently removed (cannot be un-removed)

Use this tool for batch pause/resume operations across campaigns, ad groups, or ads.

**Composite entityId required for:** \`ad\` → use \`{adGroupId}~{adId}\`, \`keyword\` → use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(getStatusCapableEntityTypeEnum())
      .describe("Type of entities to update (only types with a status field)"),
    customerId: z.string().min(1).describe("Google Ads customer ID (no dashes)"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .describe("Array of entity IDs to update (max 100)"),
    status: z.enum(["ENABLED", "PAUSED", "REMOVED"]).describe("New entity status"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk status change) without prompting for confirmation or calling the Google Ads API. No statuses are changed."
      ),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>,
      [],
      { validateCompositeIds: true }
    );
  })
  .describe("Parameters for bulk status update");

export const BulkUpdateStatusOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    entityType: z.string(),
    targetStatus: z.string(),
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

type BulkStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;
type BulkStatusOutput = z.infer<typeof BulkUpdateStatusOutputSchema>;

export async function bulkUpdateStatusLogic(
  input: BulkStatusInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<BulkStatusOutput> {
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
      entityType: input.entityType,
      targetStatus: input.status,
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
    targetStatus: input.status,
    impactPreview: input.entityIds,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      entityType: input.entityType,
      targetStatus: input.status,
      totalRequested: input.entityIds.length,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { gadsService } = resolveSessionServices(sdkContext);

  const { results } = await gadsService.bulkUpdateStatus(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityIds,
    input.status as "ENABLED" | "PAUSED" | "REMOVED",
    context
  );

  const succeeded = results.filter((r) => r.success).length;
  const failureCount = input.entityIds.length - succeeded;

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityIds.length,
      succeeded,
      failed: failureCount,
      partial_success: succeeded > 0 && failureCount > 0,
      target_status: input.status,
    },
  };

  return {
    confirmed: true,
    entityType: input.entityType,
    targetStatus: input.status,
    totalRequested: input.entityIds.length,
    successCount: succeeded,
    failureCount,
    results,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_update_status`. Validates the batch (every
 * entity ID must be non-empty) and projects the would-be effect (an N-entity
 * status change to one target status). Google Ads has no native bulk validate
 * for this path, so both axes are symbolic. Pure (no I/O).
 */
function buildBulkEffectDryRun(input: BulkStatusInput): EffectDryRunResult {
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

export function bulkUpdateStatusResponseFormatter(result: BulkStatusOutput): McpTextContent[] {
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
          `Dry run: bulk status change of ${String(n)} ${result.entityType}(s) to ${result.targetStatus} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No statuses were changed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Bulk status update of ${result.totalRequested} ${result.entityType}(s) cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: `Bulk status update → ${result.targetStatus} for ${result.entityType}: ${result.successCount}/${result.totalRequested} succeeded, ${result.failureCount} failed\n\n${JSON.stringify(result.results, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "google_ads",
      contractPlatformSlug: "google_ads",
      contractToolSlug: "bulk_update_status",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "google_ads.bulk_update_status.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Pause a single campaign",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        entityIds: ["9876543210"],
        status: "PAUSED",
      },
    },
    {
      label: "Pause multiple ad groups",
      input: {
        entityType: "adGroup",
        customerId: "1234567890",
        entityIds: ["1111111111", "2222222222", "3333333333"],
        status: "PAUSED",
      },
    },
    {
      label: "Re-enable paused ads",
      input: {
        entityType: "ad",
        customerId: "1234567890",
        entityIds: ["5555555555~7777777777", "5555555555~8888888888"],
        status: "ENABLED",
      },
    },
  ],
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
