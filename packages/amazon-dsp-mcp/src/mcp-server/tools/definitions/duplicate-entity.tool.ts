import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "amazon_dsp_duplicate_entity";
const TOOL_TITLE = "Duplicate AmazonDsp Ads Entity";
const TOOL_DESCRIPTION = `Duplicate a AmazonDsp Ads entity (copy it).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Creates a copy of the entity. The copy is created in DISABLED status by default.
Use the returned entity ID to make modifications before enabling.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to duplicate"),
    profileId: z
      .string()
      .min(1)
      .describe("AmazonDsp Advertiser ID"),
    entityId: z
      .string()
      .min(1)
      .describe("ID of the entity to duplicate"),
    options: z
      .record(z.any())
      .optional()
      .describe("Optional copy options (e.g., new name, target campaign ID)"),
  })
  .describe("Parameters for duplicating a AmazonDsp Ads entity");

export const DuplicateEntityOutputSchema = z
  .object({
    newEntity: z.record(z.any()).describe("Newly created duplicate entity data"),
    sourceEntityId: z.string(),
    entityType: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity duplication result");

type DuplicateEntityInput = z.infer<typeof DuplicateEntityInputSchema>;
type DuplicateEntityOutput = z.infer<typeof DuplicateEntityOutputSchema>;

export async function duplicateEntityLogic(
  input: DuplicateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<DuplicateEntityOutput> {
  const { amazonDspService } = resolveSessionServices(sdkContext);

  const newEntity = await amazonDspService.duplicateEntity(
    input.entityType as AmazonDspEntityType,
    input.entityId,
    input.options,
    context
  );

  return {
    newEntity: newEntity as Record<string, unknown>,
    sourceEntityId: input.entityId,
    entityType: input.entityType,
    timestamp: new Date().toISOString(),
  };
}

export function duplicateEntityResponseFormatter(result: DuplicateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.entityType} ${result.sourceEntityId} duplicated successfully\nNew entity:\n${JSON.stringify(result.newEntity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const duplicateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: DuplicateEntityInputSchema,
  outputSchema: DuplicateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Duplicate an order (campaign)",
      input: {
        entityType: "order",
        profileId: "1234567890",
        entityId: "ord_123456789",
      },
    },
    {
      label: "Duplicate a line item with new name",
      input: {
        entityType: "lineItem",
        profileId: "1234567890",
        entityId: "li_123456789",
        options: {
          name: "Copy of Line Item A",
        },
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
