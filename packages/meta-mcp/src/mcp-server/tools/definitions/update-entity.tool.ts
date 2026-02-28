import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "meta_update_entity";
const TOOL_TITLE = "Update Meta Ads Entity";
const TOOL_DESCRIPTION = `Update an existing Meta Ads entity.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Uses POST /{entityId} with PATCH semantics — only provided fields are updated.

**Gotchas:**
- Returns \`{ success: true }\` on success, NOT the full entity. Use meta_get_entity to fetch updated state.
- \`targeting\` replaces entirely (no merge with existing targeting).
- Budget values are in cents (1000 = $10 USD).
- Budget changes limited to ~4/hour per ad set.
- Writes are rate-limited at 3x read cost.`;

export const UpdateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .optional()
      .describe("Type of entity to update (optional — for informational purposes only, not used in API call)"),
    entityId: z
      .string()
      .min(1)
      .describe("The entity ID to update"),
    data: z
      .record(z.any())
      .describe("Fields to update as key-value pairs"),
  })
  .describe("Parameters for updating a Meta Ads entity");

export const UpdateEntityOutputSchema = z
  .object({
    success: z.boolean(),
    entityId: z.string(),
    entityType: z.string().optional(),
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
  const { metaService } = resolveSessionServices(sdkContext);

  const result = await metaService.updateEntity(
    input.entityId,
    input.data,
    context
  );

  const success = (result as Record<string, unknown>)?.success === true;

  return {
    success,
    entityId: input.entityId,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function updateEntityResponseFormatter(result: UpdateEntityOutput): unknown[] {
  const status = result.success ? "updated successfully" : "update returned unexpected response";
  const entityLabel = result.entityType ?? "Entity";
  return [
    {
      type: "text" as const,
      text: `${entityLabel} ${result.entityId} ${status}\n\nTimestamp: ${result.timestamp}`,
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Pause a campaign",
      input: {
        entityType: "campaign",
        entityId: "23456789012345",
        data: { status: "PAUSED" },
      },
    },
    {
      label: "Update ad set budget",
      input: {
        entityType: "adSet",
        entityId: "23456789012345",
        data: { daily_budget: 10000 },
      },
    },
    {
      label: "Update ad set targeting",
      input: {
        entityType: "adSet",
        entityId: "23456789012345",
        data: {
          targeting: {
            age_min: 25,
            age_max: 55,
            geo_locations: { countries: ["US", "CA"] },
          },
        },
      },
    },
  ],
  logic: updateEntityLogic,
  responseFormatter: updateEntityResponseFormatter,
};
