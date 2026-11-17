// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchet (#228): a tool that takes parameters must publish them.
//
// The MCP SDK publishes a tool's input schema from what `extractZodShape`
// hands it. A top-level `z.discriminatedUnion` / `z.union` comes out on the
// wire as `{"type":"object","properties":{}}`: clients and models see a tool
// with no parameters, while the server still validates the full union and
// rejects `{}`. `msads_get_entity`, `msads_update_entity` and
// `dv360_duplicate_entity` all shipped that way. For governed writes it is
// worse than a usability bug: `definitionHash` is computed over the wire
// schema, so the hash stays the same when the real parameters change.
//
// This boots every built server, reads the raw `tools/list`, and compares each
// tool's published `properties` against its Zod input:
//   - a ZodObject (after unwrapping a `.transform` / `.pipe`; in Zod 4
//     `.refine` / `.superRefine` keep the ZodObject itself)
//     with N keys must publish exactly those N keys;
//   - anything else (a union, an intersection, ...) must publish at least one
//     property. In practice it publishes none, so the fix is to flatten it
//     into a `z.object` + `superRefine`, as dv360 `duplicate_entity` and
//     msads `get_entity` / `update_entity` do.
// A `z.object({})` publishing nothing is correct and passes.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./boot-server.mjs";
import { toolsOf } from "./fleet-snapshot-inject.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

/** A Zod 4 schema's kind (`object`, `pipe`, `union`, ...), or undefined. */
const zodKind = (schema) => schema?._zod?.def?.type;

/**
 * The input keys a Zod schema declares, or `null` when it is not an object
 * schema (so its keys cannot be listed). Reads Zod 4's `_zod.def` rather than
 * `instanceof`: each package resolves its own zod instance. (Under Zod 3 this
 * read `_def.typeName`; a Zod 4 schema has none, so every schema would look
 * like a non-object and the key check below would never run, #242.)
 */
export function zodInputKeys(schema) {
  let current = schema;
  while (zodKind(current) === "pipe") current = current._zod.def.in;
  if (zodKind(current) !== "object") return null;
  return Object.keys(current._zod.def.shape).sort();
}

/** Why a tool's wire schema does not match its Zod input, or null. */
export function wireSchemaProblem(tool, wireTool) {
  const published = Object.keys(wireTool?.inputSchema?.properties ?? {}).sort();
  const declared = zodInputKeys(tool.inputSchema);
  if (declared === null) {
    return published.length === 0
      ? `input is a ${zodKind(tool.inputSchema) ?? "non-object"} schema and publishes no properties — clients see a tool with no parameters. Flatten it into z.object(...) + superRefine.`
      : null;
  }
  const missing = declared.filter((k) => !published.includes(k));
  return missing.length > 0
    ? `declares [${declared.join(", ")}] but publishes [${published.join(", ")}] (missing: ${missing.join(", ")})`
    : null;
}

describe("wireSchemaProblem", () => {
  it("reads real Zod 4 schemas, refined or transformed", () => {
    const refined = z.object({ a: z.string(), b: z.number() }).superRefine(() => {});
    expect(zodInputKeys(refined)).toEqual(["a", "b"]);
    expect(zodInputKeys(z.object({ a: z.string() }).transform((v) => v))).toEqual(["a"]);
    expect(zodInputKeys(z.union([z.object({ a: z.string() }), z.object({})]))).toBeNull();
  });

  const obj = (shape) => ({ _zod: { def: { type: "object", shape } } });
  const pipe = (inner) => ({ _zod: { def: { type: "pipe", in: inner } } });

  it("passes an object whose keys are all published, through a transform", () => {
    const tool = { inputSchema: pipe(obj({ a: {}, b: {} })) };
    expect(wireSchemaProblem(tool, { inputSchema: { properties: { a: {}, b: {} } } })).toBeNull();
  });

  it("passes a parameterless object that publishes nothing", () => {
    expect(wireSchemaProblem({ inputSchema: obj({}) }, { inputSchema: {} })).toBeNull();
  });

  it("fails a union that publishes nothing (the #228 shape)", () => {
    const tool = { inputSchema: { _zod: { def: { type: "union" } } } };
    expect(wireSchemaProblem(tool, { inputSchema: { properties: {} } })).toMatch(
      /union.*no parameters/
    );
  });

  it("fails an object whose keys did not all reach the wire", () => {
    const tool = { inputSchema: obj({ a: {}, b: {} }) };
    expect(wireSchemaProblem(tool, { inputSchema: { properties: { a: {} } } })).toMatch(
      /missing: b/
    );
  });
});

describe("every tool publishes the parameters it takes", () => {
  for (const pkg of packages) {
    it(`${pkg}`, async () => {
      const toolsModule = join(ROOT, "packages", pkg, "dist", "mcp-server", "tools", "index.js");
      const { allTools } = await import(pathToFileURL(toolsModule).href);
      expect(Array.isArray(allTools), `${pkg} tools/index.js exports allTools`).toBe(true);

      const wire = new Map(toolsOf(pkg).map((t) => [t.name, t]));
      const problems = [];
      for (const tool of allTools) {
        const problem = wireSchemaProblem(tool, wire.get(tool.name));
        if (problem) problems.push(`${tool.name}: ${problem}`);
      }
      expect(problems).toEqual([]);
    });
  }
});
