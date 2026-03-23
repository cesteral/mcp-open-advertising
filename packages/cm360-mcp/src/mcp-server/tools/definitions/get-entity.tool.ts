// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_get_entity";
const TOOL_TITLE = "Get CM360 Entity";
const TOOL_DESCRIPTION = `Get a single Campaign Manager 360 entity by ID.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}`;

export const GetEntityInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to retrieve"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to retrieve"),
  })
  .describe("Parameters for getting a CM360 entity");

export const GetEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Retrieved entity data"),
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
  const { cm360Service } = resolveSessionServices(sdkContext);

  const entity = await cm360Service.getEntity(
    input.entityType as CM360EntityType,
    input.profileId,
    input.entityId,
    context
  );

  return {
    entity: entity as unknown as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityResponseFormatter(result: GetEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity retrieved\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: {
        profileId: "123456",
        entityType: "campaign",
        entityId: "789012",
      },
    },
    {
      label: "Get a floodlight activity",
      input: {
        profileId: "123456",
        entityType: "floodlightActivity",
        entityId: "345678",
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};