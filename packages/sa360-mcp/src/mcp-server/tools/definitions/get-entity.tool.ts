import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type SA360EntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_get_entity";
const TOOL_TITLE = "Get SA360 Entity";
const TOOL_DESCRIPTION = `Get a single SA360 entity by type and ID using an SA360 query.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Returns all default fields for the entity type. Use \`sa360_search\` for custom field selection.`;

export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to retrieve"),
    customerId: z
      .string()
      .regex(/^\d+$/, "customerId must be numeric")
      .describe("SA360 customer ID (no dashes)"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to retrieve"),
  })
  .describe("Parameters for getting an SA360 entity");

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
  const { sa360Service } = resolveSessionServices(sdkContext);

  const entity = await sa360Service.getEntity(
    input.entityType as SA360EntityType,
    input.customerId,
    input.entityId,
    context
  );

  return {
    entity: entity as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function getEntityResponseFormatter(result: GetEntityOutput): any {
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
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get a campaign by ID",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        entityId: "9876543210",
      },
    },
    {
      label: "Get a bidding strategy",
      input: {
        entityType: "biddingStrategy",
        customerId: "1234567890",
        entityId: "5555555555",
      },
    },
  ],
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
