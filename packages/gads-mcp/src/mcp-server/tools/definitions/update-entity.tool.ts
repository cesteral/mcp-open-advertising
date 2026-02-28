import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import { addParentValidationIssue } from "../utils/parent-id-validation.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_update_entity";
const TOOL_TITLE = "Update Google Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Google Ads entity using the :mutate API with updateMask discipline.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

**updateMask is required** — specify which fields to update as a comma-separated string.
Only fields listed in updateMask will be modified. This prevents accidental overwrites.

Example updateMask: "name,status" or "campaignBudget,startDate"

**Composite entityId required for:** \`ad\` → use \`{adGroupId}~{adId}\`, \`keyword\` → use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to update"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to update"),
    data: z
      .record(z.any())
      .describe("Entity data fields to update"),
    updateMask: z
      .string()
      .min(1)
      .describe("Comma-separated list of fields to update (e.g., 'name,status')"),
  })
  .superRefine((input, ctx) => {
    addParentValidationIssue(
      ctx,
      input.entityType as GAdsEntityType,
      input as Record<string, unknown>,
      [],
      { validateCompositeIds: true }
    );
  })
  .describe("Parameters for updating a Google Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    mutateResult: z.record(z.any()).describe("Mutate operation result"),
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
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.updateEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.entityId,
    input.data,
    input.updateMask,
    context
  );

  return {
    mutateResult: result as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): any {
  return [
    {
      type: "text" as const,
      text: `Entity updated successfully\n${JSON.stringify(result.mutateResult, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
