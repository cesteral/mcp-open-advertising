// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import * as schemas from "../../../generated/schemas/zod.js";
import { getTransformedSchema } from "./schema-transforms.js";

/**
 * Schema introspection utilities
 * Provides Zod schema lookup, field extraction, and type inspection
 */

const MAX_FIELD_DEPTH = 5;

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (true) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = (current as z.ZodOptional<any> | z.ZodNullable<any>)._def.innerType;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      current = (current as z.ZodDefault<any>)._def.innerType;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = (current as z.ZodEffects<any>)._def.schema;
      continue;
    }
    break;
  }

  return current;
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
  prefix = "",
  depth = 0,
  maxDepth = MAX_FIELD_DEPTH,
  visited = new Set<z.ZodTypeAny>(),
): FieldInfo[] {
  const fields: FieldInfo[] = [];
  if (depth > maxDepth) {
    return fields;
  }

  const concrete = unwrapSchema(schema);
  if (visited.has(concrete)) {
    return fields;
  }

  if (concrete instanceof z.ZodObject) {
    visited.add(concrete);
    const shape = (concrete as z.ZodObject<any>).shape;
    for (const [key, value] of Object.entries(shape)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      const { schema: fieldSchema, optional } = unwrapWithOptional(value as z.ZodTypeAny);
      const description = (fieldSchema as any)._def?.description;
      const enumValues = extractEnumValues(fieldSchema) ?? undefined;
      const format = getSchemaFormat(fieldSchema);

      fields.push({
        name: fieldName,
        type: getZodTypeName(fieldSchema),
        optional,
        description,
        enum: enumValues,
        format,
      });

      fields.push(
        ...extractNestedFields(fieldSchema, fieldName, depth + 1, maxDepth, visited)
      );
    }
    visited.delete(concrete);
  }

  return fields;
}

function extractNestedFields(
  schema: z.ZodTypeAny,
  prefix: string,
  depth: number,
  maxDepth: number,
  visited: Set<z.ZodTypeAny>,
): FieldInfo[] {
  const concrete = unwrapSchema(schema);
  if (depth > maxDepth) {
    return [];
  }

  if (concrete instanceof z.ZodObject) {
    return extractFieldsFromSchema(concrete, prefix, depth, maxDepth, visited);
  }

  if (concrete instanceof z.ZodArray) {
    const elementSchema = (concrete as z.ZodArray<any>)._def.type;
    return extractFieldsFromSchema(elementSchema, `${prefix}[]`, depth, maxDepth, visited);
  }

  if (concrete instanceof z.ZodUnion) {
    const options = (concrete as z.ZodUnion<any>)._def.options as z.ZodTypeAny[];
    return options.flatMap((option) =>
      extractFieldsFromSchema(option, prefix, depth, maxDepth, visited)
    );
  }

  if (concrete instanceof z.ZodLazy) {
    const next = (concrete as z.ZodLazy<any>)._def.getter();
    return extractFieldsFromSchema(next, prefix, depth, maxDepth, visited);
  }

  return [];
}

function unwrapWithOptional(schema: z.ZodTypeAny): { schema: z.ZodTypeAny; optional: boolean } {
  let current = schema;
  let optional = false;
  while (true) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = (current as z.ZodOptional<any>)._def.innerType;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      current = (current as z.ZodNullable<any>)._def.innerType;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      current = (current as z.ZodDefault<any>)._def.innerType;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = (current as z.ZodEffects<any>)._def.schema;
      continue;
    }
    break;
  }

  return { schema: current, optional };
}

/**
 * Extract required fields from a Zod schema
 */
export function extractRequiredFields(schema: z.ZodTypeAny): string[] {
  return extractFieldsFromSchema(schema)
    .filter((field) => !field.optional)
    .map((field) => field.name);
}

/**
 * Get human-readable type name from Zod schema
 */
function getZodTypeName(schema: z.ZodTypeAny): string {
  const concrete = unwrapSchema(schema);
  if (concrete instanceof z.ZodString) return "string";
  if (concrete instanceof z.ZodNumber) return "number";
  if (concrete instanceof z.ZodBoolean) return "boolean";
  if (concrete instanceof z.ZodArray) {
    const inner = (concrete as z.ZodArray<any>)._def.type;
    return `array<${getZodTypeName(inner)}>`;
  }
  if (concrete instanceof z.ZodObject) return "object";
  if (concrete instanceof z.ZodEnum) return "enum";
  if (concrete instanceof z.ZodUnion) {
    const options = (concrete as z.ZodUnion<any>)._def.options as z.ZodTypeAny[];
    return `union<${options.map((opt) => getZodTypeName(opt)).join("|")}>`;
  }
  if (concrete instanceof z.ZodLiteral) {
    return `literal<${JSON.stringify((concrete as z.ZodLiteral<any>)._def.value)}>`;
  }
  if (concrete instanceof z.ZodRecord) return "record";
  if (concrete instanceof z.ZodLazy) {
    const next = (concrete as z.ZodLazy<any>)._def.getter();
    return getZodTypeName(next);
  }
  return "unknown";
}

function getSchemaFormat(schema: z.ZodTypeAny): string | undefined {
  const concrete = unwrapSchema(schema);
  if (concrete instanceof z.ZodString) {
    const checks = (concrete as z.ZodString)._def.checks;
    for (const check of checks) {
      if (check.kind === "datetime") return "datetime";
      if (check.kind === "email") return "email";
      if (check.kind === "url") return "url";
      if (check.kind === "uuid") return "uuid";
      if (check.kind === "regex") return "pattern";
    }
  }
  return undefined;
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
 *
 * Checks for schema transforms first to handle API response quirks,
 * then falls back to generated schema.
 */
export function getEntitySchemaByType(entityType: string): z.ZodTypeAny {
  // Check for runtime transforms first (handles API quirks like missing required arrays)
  const transformedSchema = getTransformedSchema(entityType);
  if (transformedSchema) {
    return transformedSchema;
  }

  // Fall back to generated schema
  const entityName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const schema = (schemas as any)[entityName];

  if (schema instanceof z.ZodType) {
    return schema;
  }

  // Fallback to generic record
  return z.record(z.any());
}

/**
 * Extract enum values from a Zod schema field
 */
export function extractEnumValues(schema: z.ZodTypeAny): string[] | null {
  const concrete = unwrapSchema(schema);
  if (concrete instanceof z.ZodEnum) {
    return (concrete as z.ZodEnum<any>)._def.values;
  }
  if (concrete instanceof z.ZodLiteral) {
    return [JSON.stringify((concrete as z.ZodLiteral<any>)._def.value)];
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
  return walkSchemaPath(schema, parts, 0);
}

function walkSchemaPath(
  schema: z.ZodTypeAny,
  parts: string[],
  index: number
): z.ZodTypeAny | null {
  if (index >= parts.length) {
    return schema;
  }

  const token = parts[index];
  const concrete = unwrapSchema(schema);

  if (concrete instanceof z.ZodLazy) {
    return walkSchemaPath((concrete as z.ZodLazy<any>)._def.getter(), parts, index);
  }

  if (concrete instanceof z.ZodUnion) {
    for (const option of (concrete as z.ZodUnion<any>)._def.options as z.ZodTypeAny[]) {
      const result = walkSchemaPath(option, parts, index);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (concrete instanceof z.ZodArray) {
    if (token !== "[]") {
      return null;
    }
    return walkSchemaPath((concrete as z.ZodArray<any>)._def.type, parts, index + 1);
  }

  if (concrete instanceof z.ZodObject) {
    const shape = (concrete as z.ZodObject<any>).shape;
    const next = shape[token];
    if (!next) {
      return null;
    }
    return walkSchemaPath(next as z.ZodTypeAny, parts, index + 1);
  }

  return null;
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