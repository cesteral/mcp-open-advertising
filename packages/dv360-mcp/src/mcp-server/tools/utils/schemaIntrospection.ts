import { z } from "zod";
import * as schemas from "../../../generated/schemas/zod.js";

/**
 * Schema introspection utilities
 * Dynamically extracts metadata from generated Zod schemas
 */

/**
 * Cache for available entity schemas (performance optimization)
 */
let cachedEntitySchemas: Map<string, z.ZodTypeAny> | null = null;

/**
 * Extract all available entity schemas from generated schemas
 * This auto-discovers what entities are available based on what was generated
 *
 * @param refresh - Force refresh the cache (default: false)
 * @returns Map of entity type to Zod schema
 */
export function getAvailableEntitySchemas(refresh = false): Map<string, z.ZodTypeAny> {
  // Return cached version if available and not forcing refresh
  if (!refresh && cachedEntitySchemas) {
    return cachedEntitySchemas;
  }

  const entitySchemas = new Map<string, z.ZodTypeAny>();

  // Known entity schema names (these are the main DV360 entities)
  const potentialEntities = [
    "Partner",
    "Advertiser",
    "Campaign",
    "InsertionOrder",
    "LineItem",
    "AdGroup",
    "Ad",
    "Creative",
    "CustomBiddingAlgorithm",
    "InventorySource",
    "InventorySourceGroup",
    "LocationList",
    "NegativeKeywordList",
  ];

  // Auto-discover schemas that exist
  for (const entityName of potentialEntities) {
    const schema = (schemas as any)[entityName];
    if (schema && schema instanceof z.ZodType) {
      // Convert to camelCase for entity type key
      const entityType = entityName.charAt(0).toLowerCase() + entityName.slice(1);
      entitySchemas.set(entityType, schema);
    }
  }

  // Cache the result
  cachedEntitySchemas = entitySchemas;

  return entitySchemas;
}

/**
 * Clear the schema cache (useful for testing or hot-reload scenarios)
 */
export function clearSchemaCache(): void {
  cachedEntitySchemas = null;
}

/**
 * Extract field information from a Zod schema
 */
export interface FieldInfo {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
  enum?: string[];
  format?: string;
}

/**
 * Recursively extract all fields from a Zod schema
 */
export function extractFieldsFromSchema(
  schema: z.ZodTypeAny,
  prefix = ""
): FieldInfo[] {
  const fields: FieldInfo[] = [];

  // Unwrap ZodOptional
  let unwrapped = schema;

  if (schema instanceof z.ZodOptional) {
    unwrapped = (schema as z.ZodOptional<any>)._def.innerType;
  }

  // Handle ZodObject
  if (unwrapped instanceof z.ZodObject) {
    const shape = (unwrapped as z.ZodObject<any>).shape;
    for (const [key, value] of Object.entries(shape)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      const fieldSchema = value as z.ZodTypeAny;
      const fieldOptional = fieldSchema instanceof z.ZodOptional;
      const innerSchema = fieldOptional
        ? (fieldSchema as z.ZodOptional<any>)._def.innerType
        : fieldSchema;

      // Get field metadata
      const description = (innerSchema as any)._def?.description;

      fields.push({
        name: fieldName,
        type: getZodTypeName(innerSchema),
        optional: fieldOptional,
        description,
      });

      // Recurse into nested objects (limit depth to avoid huge lists)
      if (innerSchema instanceof z.ZodObject && !prefix.includes(".")) {
        fields.push(...extractFieldsFromSchema(innerSchema, fieldName));
      }
    }
  }

  return fields;
}

/**
 * Extract required fields from a Zod schema
 */
export function extractRequiredFields(schema: z.ZodTypeAny): string[] {
  const fields = extractFieldsFromSchema(schema);
  return fields
    .filter((field) => !field.optional && !field.name.includes("."))
    .map((field) => field.name);
}

/**
 * Get human-readable type name from Zod schema
 */
function getZodTypeName(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodArray) return "array";
  if (schema instanceof z.ZodObject) return "object";
  if (schema instanceof z.ZodEnum) return "enum";
  if (schema instanceof z.ZodUnion) return "union";
  if (schema instanceof z.ZodLiteral) return "literal";
  if (schema instanceof z.ZodRecord) return "record";
  return "unknown";
}

/**
 * Check if an entity type has a generated schema
 */
export function hasGeneratedSchema(entityType: string): boolean {
  const entityName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  return (schemas as any)[entityName] instanceof z.ZodType;
}

/**
 * Get entity schema by entity type (with fallback)
 */
export function getEntitySchemaByType(entityType: string): z.ZodTypeAny {
  const entityName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const schema = (schemas as any)[entityName];

  if (schema instanceof z.ZodType) {
    return schema;
  }

  // Fallback to generic record
  return z.record(z.any());
}

/**
 * Get all supported entity types (dynamically from schemas)
 */
export function getAvailableEntityTypes(): string[] {
  const schemas = getAvailableEntitySchemas();
  return Array.from(schemas.keys());
}

/**
 * Extract enum values from a Zod schema field
 */
export function extractEnumValues(schema: z.ZodTypeAny): string[] | null {
  let unwrapped = schema;

  // Unwrap optional
  if (schema instanceof z.ZodOptional) {
    unwrapped = (schema as z.ZodOptional<any>)._def.innerType;
  }

  // Check if it's an enum
  if (unwrapped instanceof z.ZodEnum) {
    return (unwrapped as z.ZodEnum<any>)._def.values;
  }

  return null;
}

/**
 * Get field schema from a nested path (e.g., "bidStrategy.fixedBid.bidAmountMicros")
 */
export function getFieldSchemaByPath(
  schema: z.ZodTypeAny,
  path: string
): z.ZodTypeAny | null {
  const parts = path.split(".");
  let current = schema;

  for (const part of parts) {
    // Unwrap optional
    if (current instanceof z.ZodOptional) {
      current = (current as z.ZodOptional<any>)._def.innerType;
    }

    // Navigate into object
    if (current instanceof z.ZodObject) {
      const shape = (current as z.ZodObject<any>).shape;
      current = shape[part];
      if (!current) return null;
    } else {
      return null;
    }
  }

  return current;
}

/**
 * Generate updateMask suggestions for an entity type
 * Returns commonly used field paths for updates
 */
export function getCommonUpdateMasks(entityType: string): string[] {
  const commonMasks: Record<string, string[]> = {
    lineItem: [
      "entityStatus",
      "displayName",
      "bidStrategy.fixedBid.bidAmountMicros",
      "bidStrategy.maximizeSpendAutoBid.maxAverageCpmBidAmountMicros",
      "flight.dateRange.startDate",
      "flight.dateRange.endDate",
      "budget.budgetAmountMicros",
      "pacing.pacingType",
      "partnerRevenueModel.markupAmount",
    ],
    campaign: [
      "entityStatus",
      "displayName",
      "campaignBudgets",
      "campaignFlight.plannedDates.startDate",
      "campaignFlight.plannedDates.endDate",
      "campaignGoal.performanceGoalType",
    ],
    insertionOrder: [
      "entityStatus",
      "displayName",
      "budget.budgetAmountMicros",
      "pacing.pacingType",
      "pacing.dailyMaxMicros",
      "kpi",
    ],
    advertiser: ["entityStatus", "displayName"],
    partner: ["entityStatus", "displayName"],
  };

  return commonMasks[entityType] || ["entityStatus", "displayName"];
}
