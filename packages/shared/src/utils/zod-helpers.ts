/**
 * Zod schema helpers shared across MCP servers.
 */

import { z } from "zod";

/**
 * Extract the raw shape from a Zod schema.
 * The MCP SDK expects ZodRawShape (the shape object), not a full Zod schema.
 * Unwraps ZodEffects wrappers (e.g. .refine(), .transform()) to get the
 * underlying ZodObject shape.
 */
export function extractZodShape(schema: z.ZodTypeAny): z.ZodRawShape {
  let current = schema;
  while (current instanceof z.ZodEffects) {
    current = current._def.schema;
  }
  if (current instanceof z.ZodObject) {
    return current.shape;
  }
  return {};
}
