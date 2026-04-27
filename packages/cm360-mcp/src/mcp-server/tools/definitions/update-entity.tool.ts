// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_update_entity";
const TOOL_TITLE = "Update CM360 Entity";
const TOOL_DESCRIPTION = `Update a Campaign Manager 360 entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

CM360 uses PUT semantics — provide the full entity object including the id field. Use cm360_get_entity first to fetch the current state, modify the fields you need, then pass the full object.`;

export const UpdateEntityInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to update"),
    entityId: z.string().min(1).describe("The entity ID to update"),
    data: z
      .record(z.any())
      .describe("Full entity data including id field (CM360 uses PUT/replace semantics)"),
  })
  .describe("Parameters for updating a CM360 entity");

export const UpdateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Updated entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof UpdateEntityInputSchema>;
type UpdateEntityOutput = z.infer<typeof UpdateEntityOutputSchema>;

export async function updateEntityLogic(
  input: UpdateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateEntityOutput> {
  const { cm360Service } = resolveSessionServices(sdkContext);

  const data = { ...input.data, id: input.entityId };

  const entity = await cm360Service.updateEntity(
    input.entityType as CM360EntityType,
    input.profileId,
    data,
    context
  );

  return {
    entity: entity as unknown as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity updated successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateEntityInputSchema,
  outputSchema: UpdateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Update a campaign name",
      input: {
        profileId: "123456",
        entityType: "campaign",
        entityId: "789012",
        data: {
          id: "789012",
          name: "Q1 2026 Brand Campaign - Updated",
          advertiserId: "456789",
          startDate: "2026-01-15",
          endDate: "2026-03-31",
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
