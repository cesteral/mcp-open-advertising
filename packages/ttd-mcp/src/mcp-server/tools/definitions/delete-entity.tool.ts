import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_delete_entity";
const TOOL_TITLE = "Delete TTD Entity";
const TOOL_DESCRIPTION = `Delete a The Trade Desk entity by ID.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Warning: This is a destructive operation that cannot be undone.`;

export const DeleteEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to delete"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to delete"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (required for most non-advertiser entities)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID (required for adGroup)"),
    adGroupId: z
      .string()
      .optional()
      .describe("Ad Group ID (required for ad)"),
    reason: z
      .string()
      .optional()
      .describe("Reason for deletion (for audit logging)"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as TtdEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for deleting a TTD entity");

export const DeleteEntityOutputSchema = z
  .object({
    success: z.boolean(),
    entityType: z.string(),
    entityId: z.string(),
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
  const { ttdService } = resolveSessionServices(sdkContext);

  await ttdService.deleteEntity(
    input.entityType as TtdEntityType,
    input.entityId,
    context
  );

  return {
    success: true,
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: new Date().toISOString(),
  };
}

export function deleteEntityResponseFormatter(result: DeleteEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Entity deleted: ${result.entityType} ${result.entityId}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Delete an ad",
      input: {
        entityType: "ad",
        entityId: "ad111xyz",
        advertiserId: "adv123abc",
        adGroupId: "adg111aaa",
        reason: "Replaced by updated creative version",
      },
    },
    {
      label: "Delete a creative",
      input: {
        entityType: "creative",
        entityId: "cre001xyz",
        advertiserId: "adv123abc",
        reason: "Creative no longer needed after campaign end",
      },
    },
  ],
  logic: deleteEntityLogic,
  responseFormatter: deleteEntityResponseFormatter,
};
