import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getDeletableEntityTypeEnum, type CM360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "cm360_delete_entity";
const TOOL_TITLE = "Delete CM360 Entity";
const TOOL_DESCRIPTION = `Delete a Campaign Manager 360 entity.

**Supported entity types:** ${getDeletableEntityTypeEnum().join(", ")}

Only creative and floodlightActivity support deletion. Other entity types must be archived by updating their status.`;

export const DeleteEntityInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    entityType: z
      .enum(getDeletableEntityTypeEnum())
      .describe("Type of entity to delete"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to delete"),
  })
  .describe("Parameters for deleting a CM360 entity");

export const DeleteEntityOutputSchema = z
  .object({
    deleted: z.boolean().describe("Whether the entity was deleted"),
    entityId: z.string().describe("ID of the deleted entity"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity deletion result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { cm360Service } = resolveSessionServices(sdkContext);

  await cm360Service.deleteEntity(
    input.entityType as CM360EntityType,
    input.profileId,
    input.entityId,
    context
  );

  return {
    deleted: true,
    entityId: input.entityId,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity ${result.entityId} deleted successfully\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const deleteEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DeleteEntityInputSchema,
  outputSchema: DeleteEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Delete a creative",
      input: {
        profileId: "123456",
        entityType: "creative",
        entityId: "789012",
      },
    },
    {
      label: "Delete a floodlight activity",
      input: {
        profileId: "123456",
        entityType: "floodlightActivity",
        entityId: "345678",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
