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
//   - a ZodObject (after unwrapping `.refine`/`.superRefine`/`.transform`)
//     with N keys must publish exactly those N keys;
//   - anything else (a union, an intersection, ...) must publish at least one
//     property. In practice it publishes none, so the fix is to flatten it
//     into a `z.object` + `superRefine`, as dv360 `duplicate_entity` and
//     msads `get_entity` / `update_entity` do.
// A `z.object({})` publishing nothing is correct and passes.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

/**
 * The input keys a Zod schema declares, or `null` when it is not an object
 * schema (so its keys cannot be listed). Uses `_def.typeName` rather than
 * `instanceof`: each package resolves its own zod instance.
 */
export function zodInputKeys(schema) {
  let current = schema;
  while (current?._def?.typeName === "ZodEffects") current = current._def.schema;
  if (current?._def?.typeName !== "ZodObject") return null;
  const shape = typeof current._def.shape === "function" ? current._def.shape() : current.shape;
  return Object.keys(shape).sort();
}

/** Why a tool's wire schema does not match its Zod input, or null. */
export function wireSchemaProblem(tool, wireTool) {
  const published = Object.keys(wireTool?.inputSchema?.properties ?? {}).sort();
  const declared = zodInputKeys(tool.inputSchema);
  if (declared === null) {
    return published.length === 0
      ? `input is a ${tool.inputSchema?._def?.typeName ?? "non-object"} schema and publishes no properties — clients see a tool with no parameters. Flatten it into z.object(...) + superRefine.`
      : null;
  }
  const missing = declared.filter((k) => !published.includes(k));
  return missing.length > 0
    ? `declares [${declared.join(", ")}] but publishes [${published.join(", ")}] (missing: ${missing.join(", ")})`
    : null;
}

describe("wireSchemaProblem", () => {
  const obj = (shape) => ({ _def: { typeName: "ZodObject", shape: () => shape } });
  const effects = (inner) => ({ _def: { typeName: "ZodEffects", schema: inner } });

  it("passes an object whose keys are all published, through refinements", () => {
    const tool = { inputSchema: effects(obj({ a: {}, b: {} })) };
    expect(wireSchemaProblem(tool, { inputSchema: { properties: { a: {}, b: {} } } })).toBeNull();
  });

  it("passes a parameterless object that publishes nothing", () => {
    expect(wireSchemaProblem({ inputSchema: obj({}) }, { inputSchema: {} })).toBeNull();
  });

  it("fails a union that publishes nothing (the #228 shape)", () => {
    const tool = { inputSchema: { _def: { typeName: "ZodDiscriminatedUnion" } } };
    expect(wireSchemaProblem(tool, { inputSchema: { properties: {} } })).toMatch(
      /ZodDiscriminatedUnion.*no parameters/
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

      const wire = new Map((await withServerClient(pkg, listRawTools)).map((t) => [t.name, t]));
      const problems = [];
      for (const tool of allTools) {
        const problem = wireSchemaProblem(tool, wire.get(tool.name));
        if (problem) problems.push(`${tool.name}: ${problem}`);
      }
      expect(problems).toEqual([]);
    });
  }
});
