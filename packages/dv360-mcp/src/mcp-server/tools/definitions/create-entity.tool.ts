import { z, type ZodRawShape } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
  generateRelationshipDescription,
  validateEntityRelationships,
  getEntityHierarchyPath,
  getEntitySchemaForOperation,
  getRequiredFieldsFromSchema,
} from "../utils/entity-mapping-dynamic.js";
import { extractParentIds } from "../utils/entity-id-extraction.js";
import { createSimplifiedCreateEntityInputSchema } from "../utils/simplified-schemas.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

const TOOL_NAME = "dv360_create_entity";
const TOOL_TITLE = "Create DV360 Entity";

/**
 * Generate dynamic description that includes entity hierarchy information
 */
function generateToolDescription(): string {
  return "Create a DV360 entity with full server-side validation. Use entity-schema://{entityType} and entity-examples://{entityType} before calling.";
}

const TOOL_DESCRIPTION = generateToolDescription();

const COMMON_PARENT_FIELD_DESCRIPTIONS: Record<string, string> = {
  partnerId: "Partner ID (top-level DV360 scope)",
  advertiserId: "Advertiser ID (required for most advertiser-scoped resources)",
  campaignId: "Campaign ID used for linking insertion orders and reports",
  insertionOrderId: "Insertion order ID used to scope line items",
  lineItemId: "Line item ID used for ad groups and creatives",
  adGroupId: "Ad group ID used for managing ads",
};

type EntityVariantSchema = z.ZodObject<any>;

function buildParentFieldSchema(fieldName: string, required: boolean): z.ZodTypeAny {
  const description =
    COMMON_PARENT_FIELD_DESCRIPTIONS[fieldName] ||
    `${fieldName} identifier required for hierarchical DV360 operations`;

  const baseSchema = z.string().min(1, `${fieldName} cannot be empty`).describe(description);

  return required ? baseSchema : baseSchema.optional();
}

function buildEntitySpecificInputSchema(entityType: string): EntityVariantSchema {
  const config = getEntityConfigDynamic(entityType);
  const relationshipDescription = generateRelationshipDescription(entityType);
  const requiredFields = getRequiredFieldsFromSchema(entityType);
  const requiredPreview = requiredFields.slice(0, 10);
  const previewSuffix = requiredFields.length > requiredPreview.length ? ", …" : "";
  const dataDescription = `Entity data to create (${entityType}). Required fields include: ${
    requiredPreview.join(", ") || "See schema"
  }${previewSuffix}.\n${relationshipDescription}`;

  const shape: ZodRawShape = {
    entityType: z.literal(entityType).describe("Type of entity to create"),
  };

  const parentFieldNames = new Set([
    ...Object.keys(COMMON_PARENT_FIELD_DESCRIPTIONS),
    ...config.parentIds,
  ]);

  for (const fieldName of parentFieldNames) {
    const isRequired = config.parentIds.includes(fieldName);
    shape[fieldName] = buildParentFieldSchema(fieldName, isRequired);
  }

  shape.data = getEntitySchemaForOperation(entityType, "create").describe(dataDescription);

  return z.object(shape).passthrough();
}

function createInputSchema(): z.ZodTypeAny {
  const variants = getSupportedEntityTypesDynamic().map((entityType) =>
    buildEntitySpecificInputSchema(entityType)
  );

  if (variants.length === 0) {
    throw new Error("No DV360 entity types are configured for create operation");
  }

  if (variants.length === 1) {
    return variants[0].describe("Parameters for creating a DV360 entity");
  }

  return z
    .discriminatedUnion(
      "entityType",
      variants as [EntityVariantSchema, EntityVariantSchema, ...EntityVariantSchema[]]
    )
    .superRefine((input, ctx) => {
      const missingRelationships = validateEntityRelationships(
        input.entityType,
        input.data as Record<string, any>
      );

      if (missingRelationships.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Missing required parent relationship field(s): ${missingRelationships.join(", ")}`,
          path: ["data"],
        });
      }
    })
    .describe("Parameters for creating a DV360 entity");
}

// Full validation schema (used server-side for validation)
const FullCreateEntityInputSchema = createInputSchema();

// Simplified schema for MCP tool registration (avoids stdio overflow)
export const CreateEntityInputSchema = createSimplifiedCreateEntityInputSchema().describe(
  "Create DV360 entity. Fetch entity-schema://{entityType} and entity-examples://{entityType} first."
);

/**
 * Output schema for create entity tool
 */
export const CreateEntityOutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Created entity data"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity creation result");

type CreateEntityInput = z.infer<typeof CreateEntityInputSchema>;
type CreateEntityOutput = z.infer<typeof CreateEntityOutputSchema>;

/**
 * Create entity tool logic
 */
export async function createEntityLogic(
  input: CreateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateEntityOutput> {
  // Server-side validation using full schema
  const validatedInput = FullCreateEntityInputSchema.parse(input);

  // Validate entity relationships in data payload
  const missingRelationships = validateEntityRelationships(
    validatedInput.entityType,
    validatedInput.data
  );

  if (missingRelationships.length > 0) {
    const hierarchy = getEntityHierarchyPath(validatedInput.entityType);
    const relationshipDesc = generateRelationshipDescription(validatedInput.entityType);

    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Missing required parent relationship field(s) in data: ${missingRelationships.join(", ")}\n\n` +
        `To see required fields, fetch: entity-schema://${validatedInput.entityType}`,
      {
        entityType: validatedInput.entityType,
        missingFields: missingRelationships,
        hierarchy: hierarchy.join(" > "),
        hint: relationshipDesc,
        resourceUri: `entity-schema://${validatedInput.entityType}`,
        requestId: context?.requestId,
      }
    );
  }

  // Resolve DV360Service from container
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Extract parent IDs using utility
  const parentIds = extractParentIds(validatedInput);

  // Create entity
  const entity = await dv360Service.createEntity(
    validatedInput.entityType,
    parentIds,
    validatedInput.data,
    context
  );

  return {
    entity: entity as Record<string, any>,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function createEntityResponseFormatter(result: CreateEntityOutput): any {
  return [
    {
      type: "text" as const,
      text: `✓ Entity created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Create Entity Tool Definition
 */
export const createEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateEntityInputSchema,
  outputSchema: CreateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
