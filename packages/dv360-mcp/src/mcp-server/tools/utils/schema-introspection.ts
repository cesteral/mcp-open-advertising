// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import * as schemas from "../../../generated/schemas/zod.js";
import { getTransformedSchema } from "./schema-transforms.js";

const generatedSchemas = schemas as unknown as Record<string, unknown>;

function lookupGeneratedSchema(entityType: string): z.ZodTypeAny | undefined {
  const entityName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const candidate = generatedSchemas[entityName];
  return candidate instanceof z.ZodType ? (candidate as z.ZodTypeAny) : undefined;
}

/**
 * Schema introspection utilities
 * Provides Zod schema lookup, field extraction, and type inspection
 */

const MAX_FIELD_DEPTH = 5;

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (true) {
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault
    ) {
      current = (current as z.ZodOptional<any>).def.innerType as z.ZodTypeAny;
      continue;
    }
    // `.transform()` / `.pipe()` produce a ZodPipe in zod 4; `.refine()` no
    // longer wraps the schema, so only the input side needs unwrapping.
    if (current instanceof z.ZodPipe) {
      current = (current as z.ZodPipe<any, any>).def.in as z.ZodTypeAny;
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
  visited = new Set<z.ZodTypeAny>()
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
      const description = fieldSchema.description;
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

      fields.push(...extractNestedFields(fieldSchema, fieldName, depth + 1, maxDepth, visited));
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
  visited: Set<z.ZodTypeAny>
): FieldInfo[] {
  const concrete = unwrapSchema(schema);
  if (depth > maxDepth) {
    return [];
  }

  if (concrete instanceof z.ZodObject) {
    return extractFieldsFromSchema(concrete, prefix, depth, maxDepth, visited);
  }

  if (concrete instanceof z.ZodArray) {
    const elementSchema = (concrete as z.ZodArray<any>).def.element as z.ZodTypeAny;
    return extractFieldsFromSchema(elementSchema, `${prefix}[]`, depth, maxDepth, visited);
  }

  if (concrete instanceof z.ZodUnion) {
    const options = (concrete as z.ZodUnion<any>).def.options as z.ZodTypeAny[];
    return options.flatMap((option) =>
      extractFieldsFromSchema(option, prefix, depth, maxDepth, visited)
    );
  }

  if (concrete instanceof z.ZodLazy) {
    const next = (concrete as z.ZodLazy<any>).def.getter() as z.ZodTypeAny;
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
      current = (current as z.ZodOptional<any>).def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable || current instanceof z.ZodDefault) {
      current = (current as z.ZodNullable<any>).def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodPipe) {
      current = (current as z.ZodPipe<any, any>).def.in as z.ZodTypeAny;
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
    const inner = (concrete as z.ZodArray<any>).def.element as z.ZodTypeAny;
    return `array<${getZodTypeName(inner)}>`;
  }
  if (concrete instanceof z.ZodObject) return "object";
  if (concrete instanceof z.ZodEnum) return "enum";
  if (concrete instanceof z.ZodUnion) {
    const options = (concrete as z.ZodUnion<any>).def.options as z.ZodTypeAny[];
    return `union<${options.map((opt) => getZodTypeName(opt)).join("|")}>`;
  }
  if (concrete instanceof z.ZodLiteral) {
    return `literal<${(concrete as z.ZodLiteral<any>).def.values.map((v: unknown) => JSON.stringify(v)).join("|")}>`;
  }
  if (concrete instanceof z.ZodRecord) return "record";
  if (concrete instanceof z.ZodLazy) {
    const next = (concrete as z.ZodLazy<any>).def.getter() as z.ZodTypeAny;
    return getZodTypeName(next);
  }
  return "unknown";
}

function getSchemaFormat(schema: z.ZodTypeAny): string | undefined {
  const concrete = unwrapSchema(schema);
  if (concrete instanceof z.ZodString) {
    // zod 4 reports the string's format on the schema itself.
    const format = (concrete as z.ZodString).format;
    if (format === "datetime" || format === "email" || format === "url" || format === "uuid") {
      return format;
    }
    if (format === "regex") return "pattern";
  }
  return undefined;
}

/**
 * Check if an entity type has a generated schema
 */
export function hasGeneratedSchema(entityType: string): boolean {
  return lookupGeneratedSchema(entityType) !== undefined;
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
  const schema = lookupGeneratedSchema(entityType);
  if (schema) return schema;

  // Fallback to generic record
  return z.record(z.string(), z.any());
}

/**
 * Extract enum values from a Zod schema field
 */
export function extractEnumValues(schema: z.ZodTypeAny): string[] | null {
  const concrete = unwrapSchema(schema);
  if (concrete instanceof z.ZodEnum) {
    return [...(concrete as z.ZodEnum<any>).options] as string[];
  }
  if (concrete instanceof z.ZodLiteral) {
    return (concrete as z.ZodLiteral<any>).def.values.map((v: unknown) => JSON.stringify(v));
  }
  return null;
}

/**
 * Get field schema from a nested path (e.g., "bidStrategy.fixedBid.bidAmountMicros")
 */
export function getFieldSchemaByPath(schema: z.ZodTypeAny, path: string): z.ZodTypeAny | null {
  const parts = path.split(".");
  return walkSchemaPath(schema, parts, 0);
}

function walkSchemaPath(schema: z.ZodTypeAny, parts: string[], index: number): z.ZodTypeAny | null {
  if (index >= parts.length) {
    return schema;
  }

  const token = parts[index];
  const concrete = unwrapSchema(schema);

  if (concrete instanceof z.ZodLazy) {
    return walkSchemaPath((concrete as z.ZodLazy<any>).def.getter() as z.ZodTypeAny, parts, index);
  }

  if (concrete instanceof z.ZodUnion) {
    for (const option of (concrete as z.ZodUnion<any>).def.options as z.ZodTypeAny[]) {
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
    return walkSchemaPath(
      (concrete as z.ZodArray<any>).def.element as z.ZodTypeAny,
      parts,
      index + 1
    );
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
