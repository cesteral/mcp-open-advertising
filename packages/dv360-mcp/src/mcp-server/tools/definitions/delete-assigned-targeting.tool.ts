import { z } from 'zod';
import { resolveSessionServices } from '../utils/resolve-session.js';
import {
  ALL_TARGETING_TYPES,
  type TargetingParentType,
  type TargetingType,
  TARGETING_TYPE_DESCRIPTIONS,
  getSupportedTargetingParentTypes,
  validateTargetingInput,
  getTargetingValidationError,
  buildTargetingIds,
} from '../utils/targeting-metadata.js';
import { getTargetingRequiredIdInputShape } from '../utils/targeting-input-shape.js';
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from '../../../types-global/mcp.js';

const TOOL_NAME = 'dv360_delete_assigned_targeting';
const TOOL_TITLE = 'Delete DV360 Assigned Targeting Option';

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
      .describe('Type of parent entity'),
    advertiserId: z.string().describe('DV360 Advertiser ID'),
    ...TargetingRequiredIdInputShape,
    targetingType: z
      .enum(ALL_TARGETING_TYPES as unknown as [string, ...string[]])
      .describe('Targeting type'),
    assignedTargetingOptionId: z.string().describe('The assigned targeting option ID to delete'),
  })
  .refine(validateTargetingInput, getTargetingValidationError)
  .describe('Parameters for deleting an assigned targeting option');

/**
 * Output schema for delete assigned targeting tool
 */
export const DeleteAssignedTargetingOutputSchema = z
  .object({
    success: z.boolean().describe('Whether deletion was successful'),
    deletedTargetingOptionId: z.string().describe('ID of the deleted targeting option'),
    parentType: z.string().describe('Parent entity type'),
    targetingType: z.string().describe('Targeting type'),
    timestamp: z.string().datetime(),
  })
  .describe('Delete result');

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

  return {
    success: true,
    deletedTargetingOptionId: input.assignedTargetingOptionId,
    parentType: input.parentType,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function deleteAssignedTargetingResponseFormatter(result: DeleteAssignedTargetingOutput): any {
  const typeDesc =
    TARGETING_TYPE_DESCRIPTIONS[result.targetingType as TargetingType] || result.targetingType;

  return [
    {
      type: 'text' as const,
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
  },
  logic: deleteAssignedTargetingLogic,
  responseFormatter: deleteAssignedTargetingResponseFormatter,
};
