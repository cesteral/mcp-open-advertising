// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Test helper for conformance tests.
 * Extracts the shape of a Zod object schema for structural assertions.
 */
export function getObjectShape(
  schema: any
): Record<string, unknown> | null {
  if (!schema?._def) return null;
  const shapeFactory = schema._def.shape;
  if (typeof shapeFactory === "function") {
    return shapeFactory();
  }
  if (shapeFactory && typeof shapeFactory === "object") {
    return shapeFactory as Record<string, unknown>;
  }
  return null;
}
