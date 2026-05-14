// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractZodShape } from "../../src/utils/zod-helpers.js";

describe("extractZodShape", () => {
  it("returns the shape of a ZodObject", () => {
    const schema = z.object({ id: z.string(), count: z.number() });
    const result = extractZodShape(schema);
    expect(result).toBe(schema.shape);
    expect(Object.keys(result as Record<string, unknown>).sort()).toEqual(["count", "id"]);
  });

  it("unwraps ZodEffects (refine/transform) to the inner ZodObject shape", () => {
    const inner = z.object({ a: z.string() });
    const refined = inner.refine((v) => v.a.length > 0);
    const result = extractZodShape(refined);
    expect(result).toBe(inner.shape);
  });

  it("returns the schema itself for ZodDiscriminatedUnion (so registerTool keeps the validator)", () => {
    const schema = z.discriminatedUnion("type", [
      z.object({ type: z.literal("a"), aField: z.string() }),
      z.object({ type: z.literal("b"), bField: z.number() }),
    ]);
    const result = extractZodShape(schema);
    // Must not be stripped to {} — that's what caused invalid_union_discriminator
    expect(result).toBe(schema);
    // And the returned schema must still validate inputs correctly.
    const parsed = (result as typeof schema).parse({ type: "a", aField: "hello" });
    expect(parsed).toEqual({ type: "a", aField: "hello" });
    expect(() => (result as typeof schema).parse({ type: "c" })).toThrow();
  });

  it("returns the schema itself for ZodUnion", () => {
    const schema = z.union([z.string(), z.number()]);
    const result = extractZodShape(schema);
    expect(result).toBe(schema);
  });
});
