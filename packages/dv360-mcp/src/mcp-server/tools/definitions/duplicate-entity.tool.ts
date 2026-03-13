import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "dv360_duplicate_entity";
const TOOL_TITLE = "Duplicate DV360 Entity";

/**
 * Entity types that support duplication via copy-on-read.
 * Only insertionOrder and lineItem are commonly duplicated in DV360 workflows.
 */
const DUPLICATABLE_ENTITY_TYPES = ["insertionOrder", "lineItem"] as const;
type DuplicatableEntityType = (typeof DUPLICATABLE_ENTITY_TYPES)[number];

function getDuplicatableEntityTypeEnum(): [string, ...string[]] {
  return DUPLICATABLE_ENTITY_TYPES as unknown as [string, ...string[]];
}

const TOOL_DESCRIPTION = `Duplicate a DV360 insertion order or line item by creating a copy.

**Supported entity types:** ${DUPLICATABLE_ENTITY_TYPES.join(", ")}

The tool fetches the source entity, strips read-only fields, and creates a new entity
with the same configuration. The copy is created in DRAFT status by default.

**Options:**
- \`displayName\`: Custom name for the copy (defaults to "Copy of {original name}")

Returns the new entity from the DV360 API. Use dv360_get_entity to verify.`;

export const DuplicateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getDuplicatableEntityTypeEnum())
      .describe("Type of entity to duplicate (insertionOrder or lineItem)"),
    advertiserId: z
      .string()
      .describe("DV360 Advertiser ID that owns the entity"),
    entityId: z
      .string()
      .min(1)
      .describe("ID of the entity to duplicate"),
    displayName: z
      .string()
      .optional()
      .describe("Optional display name for the copy (defaults to 'Copy of {original}')"),
  })
  .describe("Parameters for duplicating a DV360 entity");

export const DuplicateEntityOutputSchema = z
  .object({
    duplicatedEntity: z.record(z.any()).describe("The newly created entity"),
    sourceEntityId: z.string().describe("ID of the source entity"),
    entityType: z.string().describe("Type of entity duplicated"),
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
  const { dv360Service } = resolveSessionServices(sdkContext);

  const entityType = input.entityType as DuplicatableEntityType;
  const entityIdField = `${entityType}Id`;

  const ids: Record<string, string> = {
    advertiserId: input.advertiserId,
    [entityIdField]: input.entityId,
  };

  const newEntity = await dv360Service.duplicateEntity(
    entityType,
    ids,
    input.displayName,
    context
  );

  return {
    duplicatedEntity: newEntity as Record<string, unknown>,
    sourceEntityId: input.entityId,
    entityType,
    timestamp: new Date().toISOString(),
  };
}

export function duplicateEntityResponseFormatter(result: DuplicateEntityOutput): McpTextContent[] {
  const entity = result.duplicatedEntity;
  const newId =
    entity[`${result.entityType}Id`] ??
    entity.name ??
    "unknown";

  return [
    {
      type: "text" as const,
      text: [
        `DV360 ${result.entityType} duplicated successfully`,
        "",
        `Source Entity ID: ${result.sourceEntityId}`,
        `New Entity ID: ${newId}`,
        `Display Name: ${entity.displayName ?? "N/A"}`,
        `Timestamp: ${result.timestamp}`,
        "",
        JSON.stringify(entity, null, 2),
      ].join("\n"),
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
    destructiveHint: true,
  },
  inputExamples: [
    {
      label: "Duplicate a line item",
      input: {
        entityType: "lineItem",
        advertiserId: "1234567890",
        entityId: "9876543210",
        displayName: "Q2 Display LI - Copy",
      },
    },
    {
      label: "Duplicate an insertion order",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567890",
        entityId: "5555555555",
      },
    },
  ],
  logic: duplicateEntityLogic,
  responseFormatter: duplicateEntityResponseFormatter,
};
