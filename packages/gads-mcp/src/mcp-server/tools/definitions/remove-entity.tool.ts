import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_remove_entity";
const TOOL_TITLE = "Remove Google Ads Entity";
const TOOL_DESCRIPTION = `Remove a Google Ads entity using the :mutate API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**Warning**: This is a destructive operation. For campaigns and ad groups, consider using \`gads_bulk_update_status\` with status \`PAUSED\` instead of removing.

Note: In Google Ads, "remove" sets the entity status to REMOVED. The entity data is retained but the entity becomes inactive and cannot be re-enabled.

**Composite entityId required for:** \`ad\` → use \`{adGroupId}~{adId}\`, \`keyword\` → use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const RemoveEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to remove"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to remove"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>
    );
  })
  .describe("Parameters for removing a Google Ads entity");

export const RemoveEntityOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Mutate operation result"),
    entityType: z.string(),
    entityId: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity removal result");

type RemoveEntityInput = z.infer<typeof RemoveEntityInputSchema>;
type RemoveEntityOutput = z.infer<typeof RemoveEntityOutputSchema>;

export async function removeEntityLogic(
  input: RemoveEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<RemoveEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.removeEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityId,
    context
  );

  return {
    mutateResult: result as Record<string, any>,
    entityType: input.entityType,
    entityId: input.entityId,
    timestamp: new Date().toISOString(),
  };
}

export function removeEntityResponseFormatter(result: RemoveEntityOutput): any {
  return [
    {
      type: "text" as const,
      text: `Entity removed: ${result.entityType} ${result.entityId}\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const removeEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: RemoveEntityInputSchema,
  outputSchema: RemoveEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  logic: removeEntityLogic,
  responseFormatter: removeEntityResponseFormatter,
};
