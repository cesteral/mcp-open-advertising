// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  ALL_TARGETING_TYPES,
  type TargetingParentType,
  type TargetingType,
  TARGETING_TYPE_DESCRIPTIONS,
  getSupportedTargetingParentTypes,
  validateTargetingInput,
  getTargetingValidationError,
  buildTargetingIds,
} from "../utils/targeting-metadata.js";
import { getTargetingRequiredIdInputShape } from "../utils/targeting-input-shape.js";
import {
  elicitDeleteConfirmation,
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
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_delete_assigned_targeting";
const TOOL_TITLE = "Delete DV360 Assigned Targeting Option";

const TOOL_DESCRIPTION = `Delete an assigned targeting option from a DV360 entity.

**Warning:** This action is irreversible. The targeting option will be immediately removed from the entity.

Use \`dv360_list_assigned_targeting\` first to find the assignedTargetingOptionId to delete.`;

/**
 * Input schema for delete assigned targeting tool
 */
const TargetingRequiredIdInputShape = getTargetingRequiredIdInputShape();

export const DeleteAssignedTargetingInputSchema = z
  .object({
    parentType: z
      .enum(getSupportedTargetingParentTypes() as [string, ...string[]])
      .describe("Type of parent entity"),
    advertiserId: z.string().describe("DV360 Advertiser ID"),
    ...TargetingRequiredIdInputShape,
    targetingType: z
      .enum(ALL_TARGETING_TYPES as unknown as [string, ...string[]])
      .describe("Targeting type"),
    assignedTargetingOptionId: z.string().describe("The assigned targeting option ID to delete"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the targeting option would be deleted) without prompting for confirmation or calling the DV360 API. Nothing is deleted."
      ),
  })
  .refine(validateTargetingInput, getTargetingValidationError)
  .describe("Parameters for deleting an assigned targeting option");

/**
 * Output schema for delete assigned targeting tool
 */
export const DeleteAssignedTargetingOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    success: z.boolean().describe("Whether deletion was successful"),
    deletedTargetingOptionId: z.string().describe("ID of the deleted targeting option"),
    parentType: z.string().describe("Parent entity type"),
    targetingType: z.string().describe("Targeting type"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. Nothing was deleted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `assigned_targeting_deleted` + scalar audit summary). Present on a confirmed delete."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Delete result");

type DeleteAssignedTargetingInput = z.infer<typeof DeleteAssignedTargetingInputSchema>;
type DeleteAssignedTargetingOutput = z.infer<typeof DeleteAssignedTargetingOutputSchema>;

/**
 * Delete assigned targeting tool logic
 */
export async function deleteAssignedTargetingLogic(
  input: DeleteAssignedTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteAssignedTargetingOutput> {
  // Effect-class write: no canonical entity snapshot for a targeting option.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    const expectedEffect: EffectResult = {
      effectKind: "assigned_targeting_deleted",
      summary: {
        parent_type: input.parentType,
        targeting_type: input.targetingType,
        deleted_targeting_option_id: input.assignedTargetingOptionId,
      },
    };
    return {
      confirmed: true,
      success: false,
      deletedTargetingOptionId: input.assignedTargetingOptionId,
      parentType: input.parentType,
      targetingType: input.targetingType,
      timestamp: new Date().toISOString(),
      dryRun: assertGovernedEffectDryRun(
        {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect,
        },
        TOOL_NAME,
        { requiresValidation: true, requiresSimulation: true }
      ),
      dispatchedCapability,
    };
  }

  const confirmed = await elicitDeleteConfirmation({
    entityLabel: `${input.targetingType} targeting on ${input.parentType}`,
    entityId: input.assignedTargetingOptionId,
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      success: false,
      deletedTargetingOptionId: input.assignedTargetingOptionId,
      parentType: input.parentType,
      targetingType: input.targetingType,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { targetingService } = resolveSessionServices(sdkContext);

  // Build IDs object using config-driven helper
  const ids = buildTargetingIds(input.parentType as TargetingParentType, input.advertiserId, input);

  await targetingService.deleteAssignedTargetingOption(
    input.parentType as TargetingParentType,
    ids,
    input.targetingType as TargetingType,
    input.assignedTargetingOptionId,
    context
  );

  const effect: EffectResult = {
    effectKind: "assigned_targeting_deleted",
    summary: {
      parent_type: input.parentType,
      targeting_type: input.targetingType,
      deleted_targeting_option_id: input.assignedTargetingOptionId,
    },
  };

  return {
    confirmed: true,
    success: true,
    deletedTargetingOptionId: input.assignedTargetingOptionId,
    parentType: input.parentType,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Format response for MCP client
 */
export function deleteAssignedTargetingResponseFormatter(
  result: DeleteAssignedTargetingOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: deleting ${result.targetingType} targeting option ${result.deletedTargetingOptionId} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). Nothing was deleted.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Deletion of targeting option ${result.deletedTargetingOptionId} cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const typeDesc =
    TARGETING_TYPE_DESCRIPTIONS[result.targetingType as TargetingType] || result.targetingType;

  return [
    {
      type: "text" as const,
      text: `Successfully deleted ${result.targetingType} targeting option

Deleted ID: ${result.deletedTargetingOptionId}
Parent: ${result.parentType}
Type: ${typeDesc}

Timestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Delete Assigned Targeting Tool Definition
 */
export const deleteAssignedTargetingTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteAssignedTargetingInputSchema,
  outputSchema: DeleteAssignedTargetingOutputSchema,
  inputExamples: [
    {
      label: "Delete geo targeting from a line item",
      input: {
        parentType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "5678901",
        targetingType: "TARGETING_TYPE_GEO_REGION",
        assignedTargetingOptionId: "lineItems-5678901-geoRegion-123456",
      },
    },
    {
      label: "Delete channel exclusion from an insertion order",
      input: {
        parentType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "4445551",
        targetingType: "TARGETING_TYPE_CHANNEL",
        assignedTargetingOptionId: "insertionOrders-4445551-channel-789012",
      },
    },
    {
      label: "Delete keyword targeting from an ad group",
      input: {
        parentType: "adGroup",
        advertiserId: "1234567",
        adGroupId: "3334441",
        targetingType: "TARGETING_TYPE_KEYWORD",
        assignedTargetingOptionId: "adGroups-3334441-keyword-654321",
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: true, // Deleting the same ID twice is idempotent (second call fails gracefully)
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "delete_assigned_targeting",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: ["advertiserId", "assignedTargetingOptionId"],
      schemaVersion: 1,
      contractId: "dv360.delete_assigned_targeting.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  logic: deleteAssignedTargetingLogic,
  responseFormatter: deleteAssignedTargetingResponseFormatter,
};
