import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_create_entity";
const TOOL_TITLE = "Create TTD Entity";
const TOOL_DESCRIPTION = `Create a new The Trade Desk entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Provide the entity data as a JSON object. Required fields vary by entity type — refer to TTD API v3 documentation.`;

export const CreateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to create"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for campaigns, ad groups, ads)"),
    data: z
      .record(z.any())
      .describe("Entity data to create (fields vary by entity type)"),
  })
  .describe("Parameters for creating a TTD entity");

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
  const { ttdService } = resolveSessionServices(sdkContext);

  const data = { ...input.data };
  if (input.advertiserId) {
    data.AdvertiserId = input.advertiserId;
  }

  const entity = await ttdService.createEntity(
    input.entityType as TtdEntityType,
    data,
    context
  );

  return {
    entity: entity as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function createEntityResponseFormatter(result: CreateEntityOutput): any {
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
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
