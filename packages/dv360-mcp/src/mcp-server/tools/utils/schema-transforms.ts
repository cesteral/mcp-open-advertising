// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Schema Transforms
 *
 * Runtime transforms for generated Zod schemas to handle API response quirks.
 * This allows us to modify schema behavior without editing generated files,
 * preserving regeneration compatibility.
 *
 * Use Cases:
 * - Making required arrays optional when API sometimes returns undefined
 * - Adding default values for fields that may be missing
 * - Handling API inconsistencies between documentation and actual responses
 */

import { z } from "zod";
import * as generatedSchemas from "../../../generated/schemas/zod.js";

/**
 * Cache for transformed schemas (performance optimization)
 */
const transformedSchemaCache = new Map<string, z.ZodTypeAny>();

/**
 * Transform Creative schema to make assets/exitEvents optional
 *
 * Issue: DV360 API marks assets and exitEvents as "Required" in the docs,
 * but third-party creatives and some creative types may return these as
 * undefined or empty. This causes Zod validation to fail.
 *
 * Fix: Make these arrays optional with empty array defaults.
 */
export function getTransformedCreativeSchema(): z.ZodTypeAny {
  const cacheKey = "creative";
  const cached = transformedSchemaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Get the original Creative schema shape
  const originalSchema = generatedSchemas.Creative;

  // We need to check if it's a ZodObject to access its shape
  if (!(originalSchema instanceof z.ZodObject)) {
    // If not an object schema, return as-is
    return originalSchema;
  }

  const originalShape = originalSchema.shape;

  // Create new schema with modified array fields
  // Keep all original fields but override the problematic ones
  const transformedSchema = z.object({
    ...originalShape,
    // Make assets optional with empty array default
    // Original: z.array(z.lazy(() => AssetAssociation))
    assets: z
      .array(z.lazy(() => generatedSchemas.AssetAssociation))
      .optional()
      .default([]),
    // Make exitEvents optional with empty array default
    // Original: z.array(z.lazy(() => ExitEvent))
    exitEvents: z
      .array(z.lazy(() => generatedSchemas.ExitEvent))
      .optional()
      .default([]),
  });

  transformedSchemaCache.set(cacheKey, transformedSchema);
  return transformedSchema;
}

/**
 * Registry of entity types that need schema transforms
 *
 * Key: entity type (camelCase)
 * Value: function that returns the transformed schema
 */
export const SCHEMA_TRANSFORMS: Record<string, () => z.ZodTypeAny> = {
  creative: getTransformedCreativeSchema,
};

/**
 * Check if an entity type has a schema transform
 */
export function hasSchemaTransform(entityType: string): boolean {
  return entityType in SCHEMA_TRANSFORMS;
}

/**
 * Get transformed schema for an entity type (if available)
 * Returns undefined if no transform exists
 */
export function getTransformedSchema(entityType: string): z.ZodTypeAny | undefined {
  const transformFn = SCHEMA_TRANSFORMS[entityType];
  if (transformFn) {
    return transformFn();
  }
  return undefined;
}

/**
 * Clear the transformed schema cache
 * Useful for testing or when schemas need to be regenerated
 */
export function clearTransformCache(): void {
  transformedSchemaCache.clear();
}