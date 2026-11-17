// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Presents the fleet's Zod 3 schemas to MCP SDK v2 exactly as SDK v1 did (#242).
 *
 * SDK v2 accepts any Standard Schema (https://standardschema.dev) whose
 * `~standard.jsonSchema` hands back the JSON Schema to publish, and validates
 * arguments with its `~standard.validate`. It refuses Zod 3 schemas outright.
 * Zod 3 itself implements Standard Schema's `validate` but not `jsonSchema`.
 *
 * This adapter fills that gap with v1's own conversion, so the SDK swap moves
 * no tool's `definitionHash` and changes no validation:
 *
 *   - JSON Schema: `zodToJsonSchema(z.object(shape), { strictUnions: true,
 *     pipeStrategy })`, the call v1 made (`zod-json-schema-compat.js`), with
 *     the same `zod-to-json-schema` version;
 *   - validation: Zod 3 `safeParseAsync(args ?? {})`, as v1 did, so handlers
 *     still receive parsed arguments (defaults applied, unknown keys
 *     stripped);
 *   - v1's edge cases, reproduced rather than "fixed", because fixing them is
 *     a hash change and belongs in the deliberate Zod 4 move:
 *       * an empty shape `{}` was built as Zod 4 Mini's `object({})`, whose
 *         JSON Schema has no `additionalProperties` (EMPTY_SHAPE_SCHEMA);
 *       * a non-object input schema (a top-level union) was published as
 *         `{ type: "object", properties: {} }` and still validated with the
 *         union (NON_OBJECT_INPUT_SCHEMA; #228 — the input-schema-wire
 *         ratchet forbids these, so this is belt and braces);
 *       * a non-object output schema was not published at all: the adapter
 *         returns `undefined` and the factory publishes no `outputSchema`.
 *
 * `scripts/lib/tool-definition-hashes.test.mjs` is what proves the result:
 * every tool's hash under v2 must equal the committed v1 baseline.
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type SchemaIo = "input" | "output";

type JsonSchema = Record<string, unknown>;

/** What SDK v2 reads off a schema: Standard Schema v1 plus its JSON Schema extension. */
export interface StandardSchemaWithJsonLike {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => Promise<
      | { value: unknown; issues?: undefined }
      | { issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<PropertyKey> }> }
    >;
    readonly jsonSchema: {
      readonly input: (options?: unknown) => JsonSchema;
      readonly output: (options?: unknown) => JsonSchema;
    };
  };
}

/** SDK v1's JSON Schema for an empty raw shape (Zod 4 Mini `object({})`, draft-07). */
export const EMPTY_SHAPE_SCHEMA: Readonly<JsonSchema> = Object.freeze({
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {},
});

/** SDK v1's placeholder for an input schema that is not an object. */
export const NON_OBJECT_INPUT_SCHEMA: Readonly<JsonSchema> = Object.freeze({
  type: "object",
  properties: {},
});

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return value instanceof z.ZodType;
}

/** True for a ZodObject, the only schema v1 published as a real object schema. */
function isObjectSchema(schema: z.ZodTypeAny): boolean {
  return (schema as { shape?: unknown }).shape !== undefined;
}

/**
 * Wrap a Zod 3 schema, or a raw shape (`{ field: z.string() }`, what
 * `extractZodShape` returns for an object), for SDK v2. Returns `undefined`
 * only for a non-object OUTPUT schema, which v1 did not publish.
 */
export function toStandardSchema(
  schemaOrShape: z.ZodTypeAny | z.ZodRawShape,
  io: SchemaIo
): StandardSchemaWithJsonLike | undefined {
  let parser: z.ZodTypeAny;
  let json: JsonSchema;

  if (!isZodSchema(schemaOrShape)) {
    parser = z.object(schemaOrShape);
    json =
      Object.keys(schemaOrShape).length === 0
        ? { ...EMPTY_SHAPE_SCHEMA }
        : (zodToJsonSchema(parser, { strictUnions: true, pipeStrategy: io }) as JsonSchema);
  } else if (isObjectSchema(schemaOrShape)) {
    parser = schemaOrShape;
    json = zodToJsonSchema(parser, { strictUnions: true, pipeStrategy: io }) as JsonSchema;
  } else if (io === "input") {
    parser = schemaOrShape;
    json = { ...NON_OBJECT_INPUT_SCHEMA };
  } else {
    return undefined;
  }

  return {
    "~standard": {
      version: 1,
      vendor: "cesteral-zod3",
      validate: async (value: unknown) => {
        const result = await parser.safeParseAsync(value ?? {});
        if (result.success) return { value: result.data };
        return {
          issues: result.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path,
          })),
        };
      },
      jsonSchema: {
        input: () => json,
        output: () => json,
      },
    },
  };
}
