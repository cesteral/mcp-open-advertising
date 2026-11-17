// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Hands the fleet's Zod 4 schemas to MCP SDK v2 (#242).
 *
 * Zod 4 (>= 4.2) implements Standard Schema with its JSON Schema extension, so
 * the SDK converts it itself (`~standard.jsonSchema`, JSON Schema draft
 * 2020-12) and validates with `~standard.validate`. This wrapper keeps the two
 * behaviours the fleet relied on under SDK v1 that the SDK does not give:
 *
 *   - a call with no `arguments` validates as `{}`, so a tool whose fields are
 *     all optional or defaulted still runs and receives its defaults;
 *   - a non-object OUTPUT schema is not published: the helper returns
 *     `undefined` and the factory publishes no `outputSchema`, because
 *     `structuredContent` must be an object.
 *
 * A raw shape (`{ field: z.string() }`, what `extractZodShape` returns for an
 * object) is wrapped in `z.object`. Under Zod 3 this module reproduced SDK v1's
 * exact JSON Schema so the SDK swap moved no `definitionHash`; the move to Zod 4
 * is the one deliberate hash change, recorded in
 * `scripts/lib/tool-definition-hashes.snapshot.json`.
 */

import { z } from "zod";

export type SchemaIo = "input" | "output";

type StandardProps = z.ZodType["~standard"];

/** What SDK v2 reads off a schema: Standard Schema v1 plus its JSON Schema extension. */
export interface StandardSchemaWithJsonLike {
  readonly "~standard": StandardProps;
}

function isZodSchema(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType;
}

/**
 * Wrap a Zod schema, or a raw shape, for SDK v2. Returns `undefined` only for
 * a non-object OUTPUT schema, which the fleet does not publish.
 */
export function toStandardSchema(
  schemaOrShape: z.ZodType | z.ZodRawShape,
  io: SchemaIo
): StandardSchemaWithJsonLike | undefined {
  const schema: z.ZodType = isZodSchema(schemaOrShape) ? schemaOrShape : z.object(schemaOrShape);
  if (io === "output" && !(schema instanceof z.ZodObject)) return undefined;

  const std = schema["~standard"];
  return {
    "~standard": {
      ...std,
      validate: (value: unknown) => std.validate(value ?? {}),
    },
  };
}
