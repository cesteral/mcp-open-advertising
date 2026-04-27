// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z, type ZodRawShape } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  getSupportedEntityTypesDynamic,
  getEntityConfigDynamic,
  generateRelationshipDescription,
  validateEntityRelationships,
  getEntitySchemaForOperation,
  getRequiredFieldsFromSchema,
} from "../utils/entity-mapping-dynamic.js";
import { extractParentIds } from "../utils/entity-id-extraction.js";
import { createSimplifiedCreateEntityInputSchema } from "../utils/simplified-schemas.js";
import { addIdValidationIssues, mergeIdsIntoData } from "../utils/parent-id-validation.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

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
    shape[fieldName] = buildParentFieldSchema(fieldName, false);
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
      const mergedData = mergeIdsIntoData(
        input.entityType,
        input.data as Record<string, unknown>,
        input as Record<string, unknown>
      );

      addIdValidationIssues(ctx, {
        entityType: input.entityType,
        input: input as Record<string, unknown>,
        data: mergedData,
        operation: "create",
        requireEntityId: false,
      });

      const missingRelationships = validateEntityRelationships(
        input.entityType,
        mergedData as Record<string, any>
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
  const mergedData = mergeIdsIntoData(
    validatedInput.entityType,
    validatedInput.data,
    validatedInput as Record<string, unknown>
  );

  // Note: validateEntityRelationships is already called inside the superRefine
  // of FullCreateEntityInputSchema.parse(input) above, so no duplicate call needed.

  // Resolve services for this session
  const { dv360Service } = resolveSessionServices(sdkContext);

  // Extract parent IDs using utility
  const parentIds = extractParentIds(validatedInput);

  // Create entity
  const entity = await dv360Service.createEntity(
    validatedInput.entityType,
    parentIds,
    mergedData,
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
export function createEntityResponseFormatter(result: CreateEntityOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `[OK] Entity created successfully\n${JSON.stringify(result.entity, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
  inputExamples: [
    {
      label: "Create a campaign",
      input: {
        entityType: "campaign",
        advertiserId: "1234567",
        data: {
          displayName: "Q1 2025 Programmatic Campaign",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          campaignGoal: {
            campaignGoalType: "CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS",
            performanceGoal: {
              performanceGoalType: "PERFORMANCE_GOAL_TYPE_CPM",
              performanceGoalAmountMicros: "5000000",
            },
          },
          campaignFlight: {
            plannedSpendAmountMicros: "100000000000",
            plannedDates: { startDate: { year: 2025, month: 1, day: 15 } },
          },
          frequencyCap: {
            maxImpressions: 5,
            timeUnit: "TIME_UNIT_DAYS",
            timeUnitCount: 1,
          },
        },
      },
    },
    {
      label: "Create an insertion order",
      input: {
        entityType: "insertionOrder",
        advertiserId: "1234567",
        campaignId: "9876543",
        data: {
          displayName: "IO - Display Prospecting",
          entityStatus: "ENTITY_STATUS_DRAFT",
          pacing: {
            pacingPeriod: "PACING_PERIOD_FLIGHT",
            pacingType: "PACING_TYPE_EVEN",
          },
          budget: {
            budgetUnit: "BUDGET_UNIT_CURRENCY",
            automationType: "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET",
            budgetSegments: [
              {
                budgetAmountMicros: "50000000000",
                dateRange: {
                  startDate: { year: 2025, month: 1, day: 15 },
                  endDate: { year: 2025, month: 3, day: 31 },
                },
              },
            ],
          },
        },
      },
    },
  ],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: createEntityLogic,
  responseFormatter: createEntityResponseFormatter,
};
