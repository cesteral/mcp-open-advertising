// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Zod schema helpers shared across MCP servers.
 */

import { z } from "zod";

/**
 * Extract the input-schema value to pass to MCP SDK `registerTool`.
 *
 * The SDK accepts either a `ZodRawShape` (record of field → schema) or a full
 * `AnySchema`. ZodObject schemas are unwrapped to their shape so the SDK can
 * compose them with task/output schemas; non-object schemas (notably
 * `z.discriminatedUnion`, `z.union`) are returned as-is so the SDK keeps the
 * full validator instead of stripping it to an empty `{}` shape — that
 * stripping caused incoming args to fail validation with
 * `invalid_union_discriminator` before reaching the tool handler.
 *
 * In Zod 4 `.refine()` / `.superRefine()` keep the `ZodObject` (the checks
 * live on it), while `.transform()` / `.pipe()` produce a `ZodPipe`; the pipe's
 * input side is unwrapped to find the object.
 */
export function extractZodShape(schema: z.ZodType): z.ZodRawShape | z.ZodType {
  let current = schema;
  while (current instanceof z.ZodPipe) {
    current = current.in as z.ZodType;
  }
  if (current instanceof z.ZodObject) {
    return current.shape;
  }
  return current;
}
