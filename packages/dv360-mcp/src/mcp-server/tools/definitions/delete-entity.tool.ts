// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds, EntityIdFieldsSchema } from "../utils/entity-id-extraction.js";
import { addIdValidationIssues } from "../utils/parent-id-validation.js";
import { runDv360DeleteDryRun, resolveDv360DeleteCapability } from "../utils/dry-run.js";
import { snapshotFromDv360Entity, buildDv360Snapshot } from "../utils/capture-snapshot.js";
import {
  elicitDeleteConfirmation,
  DryRunResultSchema,
  NormalizedEntitySnapshotSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  NormalizedEntitySnapshot,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_delete_entity";

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getSupportedEntityTypesDynamic() as [string, ...string[]]),
    ...EntityIdFieldsSchema,
    reason: z.string().optional(),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the deletion and returns a DryRunResult under `dryRun` (expected post-state = the entity with canonical status `deleted`) without calling the DV360 API. The entity is never deleted."
      ),
  })
  .superRefine((input, ctx) => {
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      operation: "delete",
      requireEntityId: true,
    });
  });

export const DeleteEntityOutputSchema = z.object({
  confirmed: z.boolean(),
  declineReason: z.string().optional(),
  success: z.boolean(),
  deletedEntity: z.record(z.any()),
  timestamp: z.string().datetime(),
  dryRun: DryRunResultSchema.optional().describe(
    "Present only when the request was made with `dry_run: true`. The entity was NOT deleted."
  ),
  before: NormalizedEntitySnapshotSchema.optional().describe(
    "Pre-delete canonical snapshot, from the read performed before deletion. Populated for in-scope kinds (campaign, insertion_order, line_item)."
  ),
  after: NormalizedEntitySnapshotSchema.optional().describe(
    "Post-delete canonical snapshot — the pre-delete entity with canonical status `deleted` (DV360 hard-deletes; a re-read 404s). Undefined for out-of-scope kinds."
  ),
  dispatchedCapability: DispatchedCapabilitySchema.describe(
    "The concrete (operation, entityKind) this call resolved to. Present on every response — dry-run, decline, and real delete alike."
  ),
});

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const entityIds = extractEntityIds(input, input.entityType);
  const primaryId =
    entityIds[`${input.entityType}Id`] ?? Object.values(entityIds).pop() ?? "(unknown)";

  const { dv360Service } = resolveSessionServices(sdkContext);
  const dispatchedCapability = resolveDv360DeleteCapability(input.entityType);

  // Dry-run never mutates and never prompts for confirmation.
  if (input.dry_run === true) {
    const dryRun = await runDv360DeleteDryRun(
      { entityType: input.entityType, ids: entityIds },
      dv360Service,
      context
    );
    return {
      confirmed: true,
      success: dryRun.wouldSucceed,
      deletedEntity: {},
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitDeleteConfirmation({
    entityLabel: input.entityType,
    entityId: primaryId,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      success: false,
      deletedEntity: {},
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const entityBeforeDeletion = (await dv360Service.getEntity(
    input.entityType,
    entityIds,
    context
  )) as Record<string, any>;

  const before: NormalizedEntitySnapshot | undefined = snapshotFromDv360Entity(
    input.entityType,
    entityIds,
    entityBeforeDeletion
  );

  await dv360Service.deleteEntity(input.entityType, entityIds, context);

  // DV360 hard-deletes; a re-read 404s. The post-state is the pre-delete entity
  // with canonical status `deleted` (undefined for out-of-scope kinds).
  const after: NormalizedEntitySnapshot | undefined =
    buildDv360Snapshot(input.entityType, entityIds, entityBeforeDeletion, {
      ...entityBeforeDeletion,
      entityStatus: "ENTITY_STATUS_DELETED",
    }) ?? undefined;

  return {
    confirmed: true,
    success: true,
    deletedEntity: entityBeforeDeletion,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Deletion cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  return [
    {
      type: "text" as const,
      text: "Entity deleted: " + JSON.stringify(result.deletedEntity, null, 2),
    },
  ];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: "Delete Entity",
  description:
    "Delete a DV360 entity. Supported types: advertiser, campaign, insertionOrder, lineItem, adGroup, creative, customBiddingAlgorithm, inventorySource, inventorySourceGroup, locationList. " +
    "Most entities are hard-deleted via the API (subsequent get returns 404). " +
    "**Line items must be in ENTITY_STATUS_ARCHIVED before delete** — DV360 returns 400 (`LINE_ITEM must be archived before being deleted`) otherwise. " +
    "Use dv360_bulk_update_status with status=ENTITY_STATUS_ARCHIVED first, then call this tool. " +
    "For reversible removal of any entity, use dv360_update_entity to set entityStatus to ENTITY_STATUS_ARCHIVED.",
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
  inputExamples: [
    {
      label: "Delete a line item",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "5678901",
        reason: "Removing unused line item from paused campaign",
      },
    },
    {
      label: "Delete a creative",
      input: {
        entityType: "creative",
        advertiserId: "1234567",
        creativeId: "8901234",
        reason: "Removing expired creative asset",
      },
    },
    {
      label: "Delete an insertion order",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "4445551",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "entity",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "delete_entity",
      operation: ["delete"],
      // Governed scope is the canonical kinds (campaign / insertion_order /
      // line_item). The tool deletes more DV360 types (creatives, ad groups,
      // advertisers, …) which resolve canonicalEntityKind:null — still
      // token-gated under enforce, just no canonical snapshot.
      entityKinds: ["campaign", "insertion_order", "line_item"],
      entityIdArgs: ["advertiserId", "campaignId", "insertionOrderId", "lineItemId"],
      readPartner: {
        toolName: "dv360_get_entity",
        argMap: {
          advertiserId: "advertiserId",
          campaignId: "campaignId",
          insertionOrderId: "insertionOrderId",
          lineItemId: "lineItemId",
        },
      },
      schemaVersion: 1,
      contractId: "dv360.delete_entity.v1",
      // `dry_run` = symbolic validate (incl. line-item-archived precondition) +
      // symbolic apply (expected post-state = entity with status `deleted`).
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
