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
import type { SdkContext } from '../../../types-global/mcp.js';

const TOOL_NAME = 'dv360_list_assigned_targeting';
const TOOL_TITLE = 'List DV360 Assigned Targeting Options';

const TOOL_DESCRIPTION = `List assigned targeting options for a DV360 entity (Insertion Order, Line Item, or Ad Group).

**Parent Types:**
- insertionOrder: Targeting at IO level (brand safety, geo)
- lineItem: Targeting at line item level (audience, inventory)
- adGroup: Targeting at ad group level (keywords, placements)

**Common Targeting Types:**
- TARGETING_TYPE_CHANNEL: Channel inclusions/exclusions
- TARGETING_TYPE_GEO_REGION: Geographic targeting
- TARGETING_TYPE_KEYWORD: Keyword targeting
- TARGETING_TYPE_URL: URL/placement targeting

See MCP resource \`targeting-types://\` for full list of all 49 targeting types.`;

/**
 * Input schema for list assigned targeting tool
 */
const TargetingRequiredIdInputShape = getTargetingRequiredIdInputShape();

export const ListAssignedTargetingInputSchema = z
  .object({
    parentType: z
      .enum(getSupportedTargetingParentTypes() as [string, ...string[]])
      .describe('Type of parent entity'),
    advertiserId: z.string().describe('DV360 Advertiser ID'),
    ...TargetingRequiredIdInputShape,
    targetingType: z
      .enum(ALL_TARGETING_TYPES as unknown as [string, ...string[]])
      .describe('Targeting type to list'),
    pageToken: z.string().optional().describe('Page token for pagination'),
    pageSize: z.number().min(1).max(100).optional().default(50).describe('Number of results per page'),
  })
  .refine(validateTargetingInput, getTargetingValidationError)
  .describe('Parameters for listing assigned targeting options');

/**
 * Output schema for list assigned targeting tool
 */
export const ListAssignedTargetingOutputSchema = z
  .object({
    assignedTargetingOptions: z.array(z.record(z.any())).describe('List of assigned targeting options'),
    nextPageToken: z.string().optional().describe('Token for next page of results'),
    has_more: z.boolean().describe('Whether more results are available via pagination'),
    totalCount: z.number().describe('Number of options in this page'),
    parentType: z.string().describe('Parent entity type'),
    targetingType: z.string().describe('Targeting type queried'),
    timestamp: z.string().datetime(),
  })
  .describe('Assigned targeting options result');

type ListAssignedTargetingInput = z.infer<typeof ListAssignedTargetingInputSchema>;
type ListAssignedTargetingOutput = z.infer<typeof ListAssignedTargetingOutputSchema>;

/**
 * List assigned targeting tool logic
 */
export async function listAssignedTargetingLogic(
  input: ListAssignedTargetingInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListAssignedTargetingOutput> {
  const { targetingService } = resolveSessionServices(sdkContext);

  // Build IDs object using config-driven helper
  const ids = buildTargetingIds(input.parentType as TargetingParentType, input.advertiserId, input);

  const result = await targetingService.listAssignedTargetingOptions(
    input.parentType as TargetingParentType,
    ids,
    input.targetingType as TargetingType,
    input.pageToken,
    input.pageSize,
    context
  );

  return {
    assignedTargetingOptions: result.assignedTargetingOptions as Record<string, any>[],
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    totalCount: result.assignedTargetingOptions.length,
    parentType: input.parentType,
    targetingType: input.targetingType,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function listAssignedTargetingResponseFormatter(result: ListAssignedTargetingOutput): McpTextContent[] {
  const typeDesc =
    TARGETING_TYPE_DESCRIPTIONS[result.targetingType as TargetingType] || result.targetingType;
  const summary = `Found ${result.totalCount} ${result.targetingType} targeting options for ${result.parentType}`;
  const pagination = result.nextPageToken
    ? `\n\nMore results available. Use nextPageToken: ${result.nextPageToken}`
    : '';

  const options =
    result.totalCount > 0
      ? `\n\nTargeting Options:\n${JSON.stringify(result.assignedTargetingOptions, null, 2)}`
      : '\n\nNo targeting options configured for this type';

  return [
    {
      type: 'text' as const,
      text: `${summary}\n\nType: ${typeDesc}${options}${pagination}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * List Assigned Targeting Tool Definition
 */
export const listAssignedTargetingTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListAssignedTargetingInputSchema,
  outputSchema: ListAssignedTargetingOutputSchema,
  inputExamples: [
    {
      label: "List all geo targeting options on a line item",
      input: {
        parentType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "5678901",
        targetingType: "TARGETING_TYPE_GEO_REGION",
        pageSize: 50,
      },
    },
    {
      label: "List channel targeting on an insertion order",
      input: {
        parentType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "4445551",
        targetingType: "TARGETING_TYPE_CHANNEL",
      },
    },
    {
      label: "List keyword targeting on an ad group",
      input: {
        parentType: "adGroup",
        advertiserId: "1234567",
        adGroupId: "3334441",
        targetingType: "TARGETING_TYPE_KEYWORD",
        pageSize: 100,
      },
    },
  ],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: listAssignedTargetingLogic,
  responseFormatter: listAssignedTargetingResponseFormatter,
};