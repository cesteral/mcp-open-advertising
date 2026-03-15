// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MsAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_get_entity";
const TOOL_TITLE = "Get Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Retrieve one or more Microsoft Advertising entities by their IDs.

Returns full entity details for the specified entity type and IDs.`;

export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to retrieve"),
    entityIds: z
      .array(z.string())
      .min(1)
      .describe("Array of entity IDs to retrieve"),
    additionalParams: z
      .record(z.unknown())
      .optional()
      .describe("Additional parameters (e.g., ReturnAdditionalFields)"),
  })
  .describe("Parameters for getting Microsoft Ads entities by ID");

export const GetEntityOutputSchema = z
  .object({
    entities: z.array(z.record(z.any())),
    entityType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity retrieval result");

type GetEntityInput = z.infer<typeof GetEntityInputSchema>;
type GetEntityOutput = z.infer<typeof GetEntityOutputSchema>;

export async function getEntityLogic(
  input: GetEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetEntityOutput> {
  const { msadsService } = resolveSessionServices(sdkContext);

  const result = (await msadsService.getEntity(
    input.entityType as MsAdsEntityType,
    input.entityIds,
    input.additionalParams,
    context
  )) as Record<string, unknown>;

  const entities = Object.values(result).find(Array.isArray) as Record<string, unknown>[] ?? [];

  return {
    entities,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Retrieved ${result.entities.length} ${result.entityType} entities\n\n${JSON.stringify(result.entities, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetEntityInputSchema,
  outputSchema: GetEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: { entityType: "campaign", entityIds: ["123456"] },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};