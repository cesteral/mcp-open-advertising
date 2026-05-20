// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { EntityIdFieldsSchema } from "../utils/entity-id-extraction.js";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getSupportedEntityTypesDynamic } from "../utils/entity-mapping-dynamic.js";
import { extractEntityIds } from "../utils/entity-id-extraction.js";
import { addIdValidationIssues } from "../utils/parent-id-validation.js";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  CesteralReadToolAnnotations,
} from "@cesteral/shared";

const TOOL_NAME = "dv360_get_entity";
const TOOL_TITLE = "Get DV360 Entity";

function generateToolDescription(): string {
  return `Get a single DV360 entity by ID.

**Entity Hierarchy:**
partner > advertiser > campaign > insertionOrder > lineItem

Supports all entity types: ${getSupportedEntityTypesDynamic().join(", ")}`;
}

const TOOL_DESCRIPTION = generateToolDescription();

/**
 * Input schema for get entity tool with dynamic validation
 * Uses Zod refinement to enforce entity-specific parent ID requirements
 */
export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getSupportedEntityTypesDynamic() as [string, ...string[]])
      .describe("Type of entity to retrieve"),
    ...EntityIdFieldsSchema,
  })
  .superRefine((input, ctx) => {
    addIdValidationIssues(ctx, {
      entityType: input.entityType,
      input: input as Record<string, unknown>,
      operation: "get",
      requireEntityId: true,
    });
  })
  .describe("Parameters for getting a DV360 entity");

/**
 * Output schema for get entity tool
 */
export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Retrieved entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity retrieval result");

type GetEntityInput = z.infer<typeof GetEntityInputSchema>;
type GetEntityOutput = z.infer<typeof GetEntityOutputSchema>;

/**
 * Get entity tool logic
 */
export async function getEntityLogic(
  input: GetEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetEntityOutput> {
  // Resolve services for this session
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Extract entity IDs using utility
  const entityIds = extractEntityIds(input, input.entityType);

  // Fetch entity
  const entity = await dv360Service.getEntity(input.entityType, entityIds, context);

  return {
    entity: entity as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `[OK] Entity retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Get Entity Tool Definition
 */
export const getEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetEntityInputSchema,
  outputSchema: GetEntityOutputSchema,
  inputExamples: [
    {
      label: "Get a line item by ID",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567",
        lineItemId: "5678901",
      },
    },
    {
      label: "Get an insertion order by ID",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        insertionOrderId: "4445551",
      },
    },
    {
      label: "Get a campaign by ID",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        campaignId: "9876543",
      },
    },
  ],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
    cesteral: {
      kind: "read",
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "get_entity",
      // Mirror `dv360_update_entity`'s round-1 entity coverage so the writer
      // can resolve this as its read partner for pre/post snapshot capture.
      entityKinds: ["campaign", "insertion_order", "line_item"],
      entityIdArgs: ["advertiserId", "campaignId", "insertionOrderId", "lineItemId"],
      schemaVersion: 1,
      contractId: "dv360.get_entity.v1",
    } satisfies CesteralReadToolAnnotations,
  },
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
