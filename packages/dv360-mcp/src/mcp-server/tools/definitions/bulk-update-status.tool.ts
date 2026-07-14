// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityExamplesByCategory } from "../utils/entity-examples.js";
import { addIdValidationIssues } from "../utils/parent-id-validation.js";
import {
  BulkOperationResultSchema,
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

const TOOL_NAME = "dv360_bulk_update_status";
const EFFECT_KIND = "entity_statuses_updated";
const TOOL_TITLE = "Bulk Update Entity Status";

// Generate dynamic description with status examples
function generateStatusToolDescription(): string {
  const statusExamples = getEntityExamplesByCategory("lineItem", "status");

  let description = `Batch update entity status (active/paused) for multiple entities in a single operation (Tier 2 workflow tool).

**Important Notes:**
- Valid statuses: ENTITY_STATUS_ACTIVE, ENTITY_STATUS_PAUSED, ENTITY_STATUS_ARCHIVED, ENTITY_STATUS_DRAFT
- Cannot unarchive once archived (status change is irreversible)
- Pausing a parent entity (campaign, IO) pauses all children

**Common Status Operations:**`;

  statusExamples.forEach((ex) => {
    description += `\n- ${ex.operation}: ${ex.notes}`;
  });

  return description;
}

const TOOL_DESCRIPTION = generateStatusToolDescription();

/**
 * Input schema for bulk update status tool
 */
export const BulkUpdateStatusInputSchema = z
  .object({
    entityType: z
      .enum(["campaign", "insertionOrder", "lineItem", "adGroup"])
      .describe("Type of entities to update"),
    advertiserId: z
      .string()
      .min(1)
      .describe("Advertiser ID (required for campaign, insertionOrder, lineItem, adGroup)"),
    entityIds: z.array(z.string()).min(1).max(50).describe("List of entity IDs to update (max 50)"),
    status: z
      .enum([
        "ENTITY_STATUS_ACTIVE",
        "ENTITY_STATUS_PAUSED",
        "ENTITY_STATUS_ARCHIVED",
        "ENTITY_STATUS_DRAFT",
      ])
      .describe("Target entity status"),
    reason: z.string().optional().describe("Reason for status change (audit trail)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, symbolically validates the batch and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be bulk status change) without prompting for confirmation or calling the DV360 API. No statuses are changed."
      ),
  })
  .superRefine((input, ctx) => {
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      operation: "update",
      requireEntityId: false,
      path: ["advertiserId"],
    });
  })
  .describe("Parameters for bulk status update");

/**
 * Output schema for bulk update status tool
 */
export const BulkUpdateStatusOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    results: z
      .array(
        BulkOperationResultSchema.extend({
          entityId: z.string(),
          advertiserId: z.string().optional(),
          entityType: z.string().optional(),
          entityName: z.string().optional(),
          previousStatus: z.string().optional(),
          newStatus: z.string().optional(),
          statusChanged: z.boolean().optional(),
        })
      )
      .describe("Canonical per-item result array"),
    successful: z
      .array(
        z.object({
          advertiserId: z.string(),
          entityType: z.string(),
          entityId: z.string(),
          entityName: z.string().optional(),
          previousStatus: z.string(),
          newStatus: z.string(),
          statusChanged: z.boolean().describe("Indicates whether an update was required"),
        })
      )
      .describe("Successfully updated entities"),
    failed: z
      .array(
        z.object({
          advertiserId: z.string(),
          entityType: z.string(),
          entityId: z.string(),
          entityName: z.string().optional(),
          error: z.string(),
        })
      )
      .describe("Failed updates with error messages"),
    totalRequested: z.number().describe("Total updates requested"),
    successCount: z.number().describe("Total successful updates"),
    failureCount: z.number().describe("Total failed updates"),
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

/**
 * Bulk update status tool logic
 */
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
      results: [],
      successful: [],
      failed: [],
      totalRequested: 0,
      successCount: 0,
      failureCount: 0,
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
      results: [],
      successful: [],
      failed: [],
      totalRequested: input.entityIds.length,
      successCount: 0,
      failureCount: 0,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { dv360Service } = resolveSessionServices(sdkContext);
  const advertiserId = input.advertiserId;

  const successful: Array<{
    advertiserId: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    previousStatus: string;
    newStatus: string;
    statusChanged: boolean;
  }> = [];
  const failed: Array<{
    advertiserId: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    error: string;
  }> = [];

  // Process each entity
  for (const entityId of input.entityIds) {
    let entityName: string | undefined;
    try {
      const entityIds: Record<string, string> = {
        advertiserId,
        [`${input.entityType}Id`]: entityId,
      };

      // Get current entity to extract previous status
      const currentEntity = (await dv360Service.getEntity(
        input.entityType,
        entityIds,
        context
      )) as any;

      entityName =
        (currentEntity.displayName as string | undefined) ||
        (currentEntity.name as string | undefined);

      const previousStatus = currentEntity.entityStatus || "ENTITY_STATUS_UNSPECIFIED";

      // Skip if already in target status
      if (previousStatus === input.status) {
        successful.push({
          advertiserId,
          entityType: input.entityType,
          entityId,
          entityName,
          previousStatus,
          newStatus: input.status,
          statusChanged: false,
        });
        continue;
      }

      // Update status — pass currentEntity to avoid redundant GET inside updateEntity
      await dv360Service.updateEntity(
        input.entityType,
        entityIds,
        {
          entityStatus: input.status,
        },
        "entityStatus",
        context,
        currentEntity as Record<string, unknown>
      );

      successful.push({
        advertiserId,
        entityType: input.entityType,
        entityId,
        entityName,
        previousStatus,
        newStatus: input.status,
        statusChanged: true,
      });
    } catch (error: any) {
      failed.push({
        advertiserId,
        entityType: input.entityType,
        entityId,
        entityName,
        error: error.message || String(error),
      });
    }
  }

  const effect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_kind: input.entityType,
      requested: input.entityIds.length,
      succeeded: successful.length,
      failed: failed.length,
      partial_success: successful.length > 0 && failed.length > 0,
      target_status: input.status,
      // Record the operator-supplied audit reason into the governed effect
      // summary (finding M1) so it survives into the tool response / audit log.
      ...(input.reason ? { reason: input.reason } : {}),
    },
  };

  return {
    confirmed: true,
    results: [
      ...successful.map((item) => ({
        entityId: item.entityId,
        success: true,
        advertiserId: item.advertiserId,
        entityType: item.entityType,
        entityName: item.entityName,
        previousStatus: item.previousStatus,
        newStatus: item.newStatus,
        statusChanged: item.statusChanged,
      })),
      ...failed.map((item) => ({
        entityId: item.entityId,
        success: false,
        error: item.error,
        advertiserId: item.advertiserId,
        entityType: item.entityType,
        entityName: item.entityName,
      })),
    ],
    successful,
    failed,
    totalRequested: input.entityIds.length,
    successCount: successful.length,
    failureCount: failed.length,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `bulk_update_status`. Validates the batch (every
 * entity ID must be non-empty) and projects the would-be effect (an N-entity
 * status change to one target status). DV360 has no native bulk validate, so
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

/**
 * Format response for MCP client
 */
export function bulkUpdateStatusResponseFormatter(
  result: BulkUpdateStatusOutput,
  input?: BulkUpdateStatusInput
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
  const summary = `Bulk status update completed: ${result.successCount}/${result.totalRequested} successful`;
  const successList =
    result.successful.length > 0
      ? `\n\nSuccessful updates:\n${JSON.stringify(result.successful, null, 2)}`
      : "";
  const failedList =
    result.failed.length > 0
      ? `\n\nFailed updates:\n${JSON.stringify(result.failed, null, 2)}`
      : "";

  // Add helpful note based on status
  let note = "";
  if (input?.status === "ENTITY_STATUS_ARCHIVED") {
    note = `\n\n⚠️  Warning: Archived entities cannot be reactivated. This change is irreversible.`;
  } else if (input?.status === "ENTITY_STATUS_PAUSED") {
    note = `\n\nNote: Paused entities can be reactivated later by setting status to ENTITY_STATUS_ACTIVE.`;
  }

  return [
    {
      type: "text" as const,
      text: `${summary}${successList}${failedList}${note}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Bulk Update Status Tool Definition
 */
export const bulkUpdateStatusTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: BulkUpdateStatusInputSchema,
  outputSchema: BulkUpdateStatusOutputSchema,
  inputExamples: [
    {
      label: "Pause multiple line items",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        entityIds: ["5678901", "5678902", "5678903"],
        status: "ENTITY_STATUS_PAUSED",
        reason: "Budget review — pausing underperforming line items",
      },
    },
    {
      label: "Activate insertion orders",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        entityIds: ["4445551", "4445552"],
        status: "ENTITY_STATUS_ACTIVE",
        reason: "Campaign launch — activating approved IOs",
      },
    },
    {
      label: "Archive a campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        entityIds: ["9876543"],
        status: "ENTITY_STATUS_ARCHIVED",
        reason: "End of flight — archiving completed campaign",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "bulk_update_status",
      operation: ["bulk_job"],
      // Effect-class: a bulk batch is governed as one batch effect (no canonical
      // per-entity snapshot). Snapshot-level bulk governance is a future bulkEntity contract.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "dv360.bulk_update_status.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: bulkUpdateStatusLogic,
  responseFormatter: bulkUpdateStatusResponseFormatter,
};
