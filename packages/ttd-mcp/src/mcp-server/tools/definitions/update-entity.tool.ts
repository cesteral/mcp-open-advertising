import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_update_entity";
const TOOL_TITLE = "Update TTD Entity";
const TOOL_DESCRIPTION = `Update an existing The Trade Desk entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses TTD API v3 PUT endpoint. Provide the entity ID and a data object with the fields to update.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to update"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to update"),
    data: z
      .record(z.any())
      .describe("Entity data fields to update"),
  })
  .describe("Parameters for updating a TTD entity");

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
  const { ttdService } = resolveSessionServices(sdkContext);

  const entity = await ttdService.updateEntity(
    input.entityType as TtdEntityType,
    input.entityId,
    input.data,
    context
  );

  return {
    entity: entity as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): any {
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
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
