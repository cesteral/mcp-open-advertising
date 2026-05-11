// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { addIdValidationIssues } from "../utils/parent-id-validation.js";
import { elicitDeleteConfirmation } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "dv360_delete_entity";

export const DeleteEntityInputSchema = z
  .object({
    entityType: z.enum(getSupportedEntityTypesDynamic() as [string, ...string[]]),
    partnerId: z.string().optional(),
    advertiserId: z.string().optional(),
    campaignId: z.string().optional(),
    insertionOrderId: z.string().optional(),
    lineItemId: z.string().optional(),
    adGroupId: z.string().optional(),
    adId: z.string().optional(),
    creativeId: z.string().optional(),
    reason: z.string().optional(),
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
});

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const entityIds = extractEntityIds(input, input.entityType);
  const primaryId = entityIds[`${input.entityType}Id`] ?? Object.values(entityIds).pop() ?? "(unknown)";

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
    };
  }

  const { dv360Service } = resolveSessionServices(sdkContext);
  const entityBeforeDeletion = (await dv360Service.getEntity(
    input.entityType,
    entityIds,
    context
  )) as Record<string, any>;
  await dv360Service.deleteEntity(input.entityType, entityIds, context);
  return {
    confirmed: true,
    success: true,
    deletedEntity: entityBeforeDeletion,
    timestamp: new Date().toISOString(),
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
    "Most entities are hard-deleted via the API. To archive instead (reversible), use dv360_update_entity to set entityStatus to ENTITY_STATUS_ARCHIVED.",
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
  },
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
