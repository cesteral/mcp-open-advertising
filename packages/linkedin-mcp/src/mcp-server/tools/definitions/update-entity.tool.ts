import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "linkedin_update_entity";
const TOOL_TITLE = "Update LinkedIn Ads Entity";
const TOOL_DESCRIPTION = `Update an existing LinkedIn Ads entity via PATCH (partial update).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses X-Restli-Method: PARTIAL_UPDATE semantics — only provided fields are updated.

**Gotchas:**
- LinkedIn PATCH uses a \`patch.$set\` wrapper internally; just provide the fields to update.
- Status values: ACTIVE, PAUSED, DRAFT, ARCHIVED, CANCELED
- Budget changes are applied immediately.
- Writes are rate-limited at 3x read cost.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to update"),
    entityUrn: z
      .string()
      .min(1)
      .describe("The entity URN to update (e.g., urn:li:sponsoredCampaign:123)"),
    data: z
      .record(z.any())
      .describe("Fields to update as key-value pairs"),
  })
  .describe("Parameters for updating a LinkedIn Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    success: z.boolean(),
    entityUrn: z.string(),
    entityType: z.string(),
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
  const { linkedInService } = resolveSessionServices(sdkContext);

  await linkedInService.updateEntity(
    input.entityType as LinkedInEntityType,
    input.entityUrn,
    input.data,
    context
  );

  return {
    success: true,
    entityUrn: input.entityUrn,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.entityUrn} updated successfully\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Pause a campaign",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
        data: { status: "PAUSED" },
      },
    },
    {
      label: "Update campaign daily budget",
      input: {
        entityType: "campaign",
        entityUrn: "urn:li:sponsoredCampaign:123456789",
        data: {
          dailyBudget: { amount: "100.00", currencyCode: "USD" },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
