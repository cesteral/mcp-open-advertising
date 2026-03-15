// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from 'zod';
import { resolveSessionServices } from '../utils/resolve-session.js';
import {
  ALL_TARGETING_TYPES,
  type TargetingParentType,
  type TargetingType,
  TARGETING_TYPE_DESCRIPTIONS,
  getTargetingDetailSchemaName,
  getSupportedTargetingParentTypes,
  validateTargetingInput,
  getTargetingValidationError,
  buildTargetingIds,
} from '../utils/targeting-metadata.js';
import { getTargetingRequiredIdInputShape } from '../utils/targeting-input-shape.js';
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from '../../../types-global/mcp.js';

const TOOL_NAME = 'dv360_create_assigned_targeting';
const TOOL_TITLE = 'Create DV360 Assigned Targeting Option';

const TOOL_DESCRIPTION = `Create a new assigned targeting option on a DV360 entity (Insertion Order, Line Item, or Ad Group).

**Important:** Fetch the targeting schema first using the MCP resource \`targeting-schema://{targetingType}\` to understand required fields.

**Example data payloads:**

For TARGETING_TYPE_CHANNEL:
\`\`\`json
{
  "channelDetails": {
    "channelId": "123456",
    "negative": true
  }
}
\`\`\`

For TARGETING_TYPE_GEO_REGION:
\`\`\`json
{
  "geoRegionDetails": {
    "targetingOptionId": "2840",
    "negative": false
  }
}
\`\`\`

See MCP resource \`targeting-types://\` for all available targeting types.`;

/**
 * Input schema for create assigned targeting tool
 */
const TargetingRequiredIdInputShape = getTargetingRequiredIdInputShape();

export const CreateAssignedTargetingInputSchema = z
  .object({
    parentType: z
      .enum(getSupportedTargetingParentTypes() as [string, ...string[]])
      .describe('Type of parent entity'),
    advertiserId: z.string().describe('DV360 Advertiser ID'),
    ...TargetingRequiredIdInputShape,
    targetingType: z
      .enum(ALL_TARGETING_TYPES as unknown as [string, ...string[]])
      .describe('Targeting type to create'),
    data: z
      .record(z.any())
      .describe(
        'Targeting option data payload. Structure depends on targetingType. Fetch targeting-schema://{type} for schema details.'
      ),
  })
  .refine(validateTargetingInput, getTargetingValidationError)
  .describe('Parameters for creating an assigned targeting option');

/**
 * Output schema for create assigned targeting tool
 */
export const CreateAssignedTargetingOutputSchema = z
  .object({
    createdTargetingOption: z.record(z.any()).describe('The created assigned targeting option'),
    assignedTargetingOptionId: z.string().describe('ID of the newly created targeting option'),
    parentType: z.string().describe('Parent entity type'),
    targetingType: z.string().describe('Targeting type'),
    timestamp: z.string().datetime(),
  })
  .describe('Created assigned targeting option result');

type CreateAssignedTargetingInput = z.infer<typeof CreateAssignedTargetingInputSchema>;
type CreateAssignedTargetingOutput = z.infer<typeof CreateAssignedTargetingOutputSchema>;

/**
 * Create assigned targeting tool logic
 */
export async function createAssignedTargetingLogic(
  input: CreateAssignedTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateAssignedTargetingOutput> {
  const { targetingService } = resolveSessionServices(sdkContext);

  // Build IDs object using config-driven helper
  const ids = buildTargetingIds(input.parentType as TargetingParentType, input.advertiserId, input);

  const result = await targetingService.createAssignedTargetingOption(
    input.parentType as TargetingParentType,
    ids,
    input.targetingType as TargetingType,
    input.data,
    context
  );

  const resultObj = result as Record<string, any>;

  return {
    createdTargetingOption: resultObj,
    assignedTargetingOptionId: resultObj.assignedTargetingOptionId || resultObj.name?.split('/').pop() || 'unknown',
    parentType: input.parentType,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function createAssignedTargetingResponseFormatter(result: CreateAssignedTargetingOutput): McpTextContent[] {
  const typeDesc =
    TARGETING_TYPE_DESCRIPTIONS[result.targetingType as TargetingType] || result.targetingType;
  const schemaName = getTargetingDetailSchemaName(result.targetingType as TargetingType);

  return [
    {
      type: 'text' as const,
      text: `Successfully created ${result.targetingType} targeting option

ID: ${result.assignedTargetingOptionId}
Parent: ${result.parentType}
Type: ${typeDesc}
Schema: ${schemaName}

Created Targeting Option:
${JSON.stringify(result.createdTargetingOption, null, 2)}

Timestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Create Assigned Targeting Tool Definition
 */
export const createAssignedTargetingTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateAssignedTargetingInputSchema,
  outputSchema: CreateAssignedTargetingOutputSchema,
  inputExamples: [
    {
      label: "Assign geo targeting to a line item",
      input: {
        parentType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "7654321",
        targetingType: "TARGETING_TYPE_GEO_REGION",
        data: {
          geoRegionDetails: { displayName: "United States", geoRegionType: "GEO_REGION_TYPE_COUNTRY", negative: false },
        },
      },
    },
    {
      label: "Assign channel targeting to an insertion order",
      input: {
        parentType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "5555555",
        targetingType: "TARGETING_TYPE_CHANNEL",
        data: {
          channelDetails: { channelId: "888999", negative: false },
        },
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: createAssignedTargetingLogic,
  responseFormatter: createAssignedTargetingResponseFormatter,
};