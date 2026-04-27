// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_create_entity";
const TOOL_TITLE = "Create CM360 Entity";
const TOOL_DESCRIPTION = `Create a new Campaign Manager 360 entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide the entity data as a JSON object. Required fields vary by entity type — refer to CM360 API v5 documentation.`;

export const CreateEntityInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to create"),
    data: z.record(z.any()).describe("Entity data to create (fields vary by entity type)"),
  })
  .describe("Parameters for creating a CM360 entity");

export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  const { cm360Service } = resolveSessionServices(sdkContext);

  const entity = await cm360Service.createEntity(
    input.entityType as CM360EntityType,
    input.profileId,
    input.data,
    context
  );

  return {
    entity: entity as unknown as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateEntityInputSchema,
  outputSchema: CreateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create a campaign",
      input: {
        profileId: "123456",
        entityType: "campaign",
        data: {
          name: "Q1 2026 Brand Campaign",
          advertiserId: "789012",
          startDate: "2026-01-15",
          endDate: "2026-03-31",
        },
      },
    },
    {
      label: "Create a floodlight activity",
      input: {
        profileId: "123456",
        entityType: "floodlightActivity",
        data: {
          name: "Purchase Confirmation",
          floodlightConfigurationId: "456789",
          floodlightActivityGroupId: "111222",
          expectedUrl: "https://example.com/purchase",
          countingMethod: "STANDARD_COUNTING",
        },
      },
    },
  ],
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
