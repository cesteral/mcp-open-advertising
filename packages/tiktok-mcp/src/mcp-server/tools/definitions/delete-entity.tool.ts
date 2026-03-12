import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "tiktok_delete_entity";
const TOOL_TITLE = "Delete TikTok Ads Entity";
const TOOL_DESCRIPTION = `Delete one or more TikTok Ads entities.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

TikTok delete uses a POST to the /delete/ endpoint with an array of entity IDs.
Deleted entities cannot be recovered. Consider using \`tiktok_bulk_update_status\` with DISABLE first.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to delete"),
    advertiserId: z
      .string()
      .min(1)
      .describe("TikTok Advertiser ID"),
    entityIds: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .describe("Array of entity IDs to delete (max 20)"),
  })
  .describe("Parameters for deleting TikTok Ads entities");

export const DeleteEntityOutputSchema = z
  .object({
    deleted: z.boolean(),
    entityType: z.string(),
    entityIds: z.array(z.string()),
    timestamp: z.string().datetime(),
  })
  .describe("Entity delete result");

type DeleteEntityInput = z.infer<typeof DeleteEntityInputSchema>;
type DeleteEntityOutput = z.infer<typeof DeleteEntityOutputSchema>;

export async function deleteEntityLogic(
  input: DeleteEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DeleteEntityOutput> {
  const { tiktokService } = resolveSessionServices(sdkContext);

  await tiktokService.deleteEntity(
    input.entityType as TikTokEntityType,
    input.entityIds,
    context
  );

  return {
    deleted: true,
    entityType: input.entityType,
    entityIds: input.entityIds,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} entities deleted: ${result.entityIds.join(", ")}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Delete a single campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567890",
        entityIds: ["1800123456789"],
      },
    },
    {
      label: "Delete multiple ad groups",
      input: {
        entityType: "adGroup",
        advertiserId: "1234567890",
        entityIds: ["1700111111111", "1700222222222"],
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
