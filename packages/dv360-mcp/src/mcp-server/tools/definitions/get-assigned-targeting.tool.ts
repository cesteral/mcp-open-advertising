// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from '@cesteral/shared';

const TOOL_NAME = 'dv360_get_assigned_targeting';
const TOOL_TITLE = 'Get DV360 Assigned Targeting Option';

const TOOL_DESCRIPTION = `Get a single assigned targeting option by ID.

Use this to retrieve details of a specific targeting configuration on an Insertion Order, Line Item, or Ad Group.`;

/**
 * Input schema for get assigned targeting tool
 */
const TargetingRequiredIdInputShape = getTargetingRequiredIdInputShape();

export const GetAssignedTargetingInputSchema = z
  .object({
    parentType: z
      .enum(getSupportedTargetingParentTypes() as [string, ...string[]])
      .describe('Type of parent entity'),
    advertiserId: z.string().describe('DV360 Advertiser ID'),
    ...TargetingRequiredIdInputShape,
    targetingType: z
      .enum(ALL_TARGETING_TYPES as unknown as [string, ...string[]])
      .describe('Targeting type'),
    assignedTargetingOptionId: z.string().describe('The assigned targeting option ID to retrieve'),
  })
  .refine(validateTargetingInput, getTargetingValidationError)
  .describe('Parameters for getting an assigned targeting option');

/**
 * Output schema for get assigned targeting tool
 */
export const GetAssignedTargetingOutputSchema = z
  .object({
    assignedTargetingOption: z.record(z.any()).describe('The assigned targeting option'),
    parentType: z.string().describe('Parent entity type'),
    targetingType: z.string().describe('Targeting type'),
    timestamp: z.string().datetime(),
  })
  .describe('Assigned targeting option result');

type GetAssignedTargetingInput = z.infer<typeof GetAssignedTargetingInputSchema>;
type GetAssignedTargetingOutput = z.infer<typeof GetAssignedTargetingOutputSchema>;

/**
 * Get assigned targeting tool logic
 */
export async function getAssignedTargetingLogic(
  input: GetAssignedTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetAssignedTargetingOutput> {
  const { targetingService } = resolveSessionServices(sdkContext);

  // Build IDs object using config-driven helper
  const ids = buildTargetingIds(input.parentType as TargetingParentType, input.advertiserId, input);

  const result = await targetingService.getAssignedTargetingOption(
    input.parentType as TargetingParentType,
    ids,
    input.targetingType as TargetingType,
    input.assignedTargetingOptionId,
    context
  );

  return {
    assignedTargetingOption: result as Record<string, any>,
    parentType: input.parentType,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function getAssignedTargetingResponseFormatter(result: GetAssignedTargetingOutput): McpTextContent[] {
  const typeDesc =
    TARGETING_TYPE_DESCRIPTIONS[result.targetingType as TargetingType] || result.targetingType;

  return [
    {
      type: 'text' as const,
      text: `Assigned Targeting Option (${result.targetingType})\n\nType: ${typeDesc}\nParent: ${result.parentType}\n\n${JSON.stringify(result.assignedTargetingOption, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Get Assigned Targeting Tool Definition
 */
export const getAssignedTargetingTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetAssignedTargetingInputSchema,
  outputSchema: GetAssignedTargetingOutputSchema,
  inputExamples: [
    {
      label: "Get a specific geo targeting option on a line item",
      input: {
        parentType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "5678901",
        targetingType: "TARGETING_TYPE_GEO_REGION",
        assignedTargetingOptionId: "lineItems-5678901-geoRegion-123456",
      },
    },
    {
      label: "Get a channel targeting option on an insertion order",
      input: {
        parentType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "4445551",
        targetingType: "TARGETING_TYPE_CHANNEL",
        assignedTargetingOptionId: "insertionOrders-4445551-channel-789012",
      },
    },
  ],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: getAssignedTargetingLogic,
  responseFormatter: getAssignedTargetingResponseFormatter,
};