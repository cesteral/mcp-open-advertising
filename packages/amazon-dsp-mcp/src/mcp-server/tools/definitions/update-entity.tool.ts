import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_update_entity";
const TOOL_TITLE = "Update AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Update a AmazonDsp Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

AmazonDsp uses POST for updates with entity ID in the body. Only provided fields are modified.

**Gotchas:**
- Use \`amazon_dsp_bulk_update_status\` for status-only changes (more efficient)
- profile_id is automatically injected`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to update"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to update"),
    data: z
      .record(z.any())
      .describe("Fields to update as key-value pairs"),
  })
  .describe("Parameters for updating a AmazonDsp Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    entityId: z.string(),
    entityType: z.string(),
    updated: z.boolean(),
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
  const { amazonDspService } = resolveSessionServices(sdkContext);

  await amazonDspService.updateEntity(
    input.entityType as AmazonDspEntityType,
    input.entityId,
    input.data,
    context
  );

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    updated: true,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityId} updated successfully\n\nTimestamp: ${result.timestamp}`,
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
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Update order (campaign) name and budget",
      input: {
        entityType: "order",
        profileId: "1234567890",
        entityId: "ord_123456789",
        data: {
          name: "Updated Order Name",
          budget: 20000,
        },
      },
    },
    {
      label: "Update line item bid",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        entityId: "li_123456789",
        data: {
          bidding: { bidPrice: 2.0 },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
