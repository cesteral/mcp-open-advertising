// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type MetaEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "meta_get_entity";
const TOOL_TITLE = "Get Meta Ads Entity";
const TOOL_DESCRIPTION = `Get a single Meta Ads entity by ID.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Important:** Meta returns no fields by default. Specify \`fields\` or rely on defaults.`;

export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to retrieve"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to retrieve"),
    fields: z
      .array(z.string())
      .optional()
      .describe("Fields to return (defaults to common fields for the entity type)"),
  })
  .describe("Parameters for getting a Meta Ads entity");

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
  const { metaService } = resolveSessionServices(sdkContext);

  const entity = await metaService.getEntity(
    input.entityType as MetaEntityType,
    input.entityId,
    input.fields,
    context
  );

  return {
    entity: entity as unknown as Record<string, unknown>,
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
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: {
        entityType: "campaign",
        entityId: "23456789012345",
      },
    },
    {
      label: "Get an ad set with specific fields",
      input: {
        entityType: "adSet",
        entityId: "23456789012345",
        fields: ["id", "name", "status", "targeting", "daily_budget"],
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};