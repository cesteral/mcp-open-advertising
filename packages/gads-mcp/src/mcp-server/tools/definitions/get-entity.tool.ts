import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_get_entity";
const TOOL_TITLE = "Get Google Ads Entity";
const TOOL_DESCRIPTION = `Get a single Google Ads entity by type and ID using a GAQL query.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Returns all default fields for the entity type. Use \`gads_gaql_search\` for custom field selection.

**Note on entity IDs:** For \`ad\` entities, use the ad's simple ID. For \`keyword\` entities, use the criterion ID. GAQL queries filter by the simple ID field, so composite IDs are not needed for reads.`;

export const GetEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to retrieve"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to retrieve"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for getting a Google Ads entity");

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
  const { gadsService } = resolveSessionServices(sdkContext);

  const entity = await gadsService.getEntity(
    input.entityType as GAdsEntityType,
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
    idempotentHint: true,
  },
  logic: getEntityLogic,
  responseFormatter: getEntityResponseFormatter,
};
