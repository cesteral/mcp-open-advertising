// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// #204 Tier 2: per-tool untrusted-content declarations, ratcheted against the
// live tools/list.
//
// A server's card says `path_reporting: "per-response"` only if registry.json
// says so (`untrustedContent.pathReporting`). That is a hand-authored claim, so
// this boots every built server and checks it against what the server actually
// publishes, the same pattern terminal-operations.test.mjs uses for #201:
//
//   - "per-response" => EVERY tool in tools/list carries a declaration under
//     `_meta["cesteral/untrusted"]`. A new tool added without one fails here,
//     instead of silently making the card lie.
//   - "unsupported"  => at least one tool is undeclared. A server whose tools
//     all declare but whose claim was never flipped fails too, so the card does
//     not undersell a finished server forever.
//
// And for every declaration present, whichever server it is on:
//   - its shape is valid (v: 1, two arrays);
//   - each structured path's first segment is a real top-level property of the
//     tool's published outputSchema, so a path cannot point at nothing;
//   - no undeclared top-level property is OPEN anywhere inside it: a record,
//     `any`, `.passthrough()` / `.catchall()` object, or an array of any of
//     these, at any depth, following `$ref`s. An open schema is how a raw
//     platform object passes through, so an undeclared one is almost always an
//     omission. The one exemption is a property named `summary`: that is
//     contract-schema's `EffectResult.summary` (on `effect` and on
//     `dryRun.expectedEffect`), a scalar audit summary of ids, counts and
//     caller input. A tool whose summary carries platform text
//     (ttd_create_report_template's `template_name`) declares it anyway.
//
// A schema heuristic cannot protect a path to a plain string (`$.creativeName`,
// `$.errors`): nothing distinguishes it from a server-built string. So every
// per-response server's declarations are also pinned in
// untrusted-declarations.snapshot.json, and removing or changing any path, or
// adding a tool, needs a visible edit to that file in review. Regenerate it
// with `pnpm sync:untrusted-declarations` after checking the change is right.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";
import {
  OPEN_EXEMPT_PROPERTIES,
  SNAPSHOT_PATH,
  declarationsOf,
  isOpen,
} from "./untrusted-declarations.mjs";

const KEY = "cesteral/untrusted";
const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

const claimFor = (pkg) =>
  registry.servers.find((s) => s.package === pkg)?.untrustedContent?.pathReporting ?? "unsupported";

const firstSegment = (path) => /^\$\.([A-Za-z_][A-Za-z0-9_]*)/.exec(path)?.[1];

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));

describe("isOpen recognises every open JSON Schema shape", () => {
  const closed = { type: "object", properties: { id: { type: "string" } } };
  it.each([
    ["z.any()", {}],
    ["z.record(z.any())", { type: "object", additionalProperties: {} }],
    ["an object with no properties", { type: "object" }],
    ["array of any", { type: "array" }],
    ["array of records", { type: "array", items: { type: "object", additionalProperties: {} } }],
    [".passthrough()", { ...closed, additionalProperties: true }],
    [".catchall(z.any())", { ...closed, additionalProperties: {} }],
    ["nullable record as anyOf", { anyOf: [{ type: "object" }, { type: "null" }] }],
    ["nullable record as a type array", { type: ["object", "null"] }],
    [
      "an open field nested in a closed object",
      { type: "object", properties: { entity: { type: "object", additionalProperties: {} } } },
    ],
    [
      "a $ref to an open schema",
      { type: "object", properties: { a: { type: "object" }, b: { $ref: "#/properties/a" } } },
    ],
  ])("open: %s", (_label, schema) => {
    expect(isOpen(schema)).toBe(true);
  });

  it.each([
    ["a string", { type: "string" }],
    ["an enum", { enum: ["A", "B"] }],
    ["a closed object", { ...closed, additionalProperties: false }],
    ["a closed object, additionalProperties unset", closed],
    ["an array of strings", { type: "array", items: { type: "string" } }],
    [
      "an open EffectResult summary",
      { type: "object", properties: { summary: { type: "object", additionalProperties: {} } } },
    ],
    ["a self-referencing $ref", { type: "object", properties: { next: { $ref: "#" } } }],
  ])("closed: %s", (_label, schema) => {
    expect(isOpen(schema)).toBe(false);
  });
});

describe("untrusted-content declarations match each server's claim (#204)", () => {
  it("registry claims are one of the two allowed values", () => {
    for (const server of registry.servers) {
      const claim = server.untrustedContent?.pathReporting;
      if (claim !== undefined) {
        expect(["unsupported", "per-response"], server.package).toContain(claim);
      }
    }
  });

  it("at least one server has finished declaring, so this ratchet is not vacuous", () => {
    expect(packages.filter((p) => claimFor(p) === "per-response").length).toBeGreaterThan(0);
  });

  it.each(packages)(
    "%s",
    async (pkg) => {
      const tools = await withServerClient(pkg, (client) => listRawTools(client));
      expect(tools.length, `${pkg} lists no tools`).toBeGreaterThan(0);

      const undeclared = [];
      for (const tool of tools) {
        const declaration = tool._meta?.[KEY];
        if (declaration === undefined) {
          undeclared.push(tool.name);
          continue;
        }

        expect(declaration.v, `${tool.name}: declaration version`).toBe(1);
        expect(Array.isArray(declaration.structuredPaths), tool.name).toBe(true);
        expect(Array.isArray(declaration.contentBlocks), tool.name).toBe(true);

        const schemaProps = tool.outputSchema?.properties ?? {};
        const properties = Object.keys(schemaProps);
        for (const path of declaration.structuredPaths) {
          expect(
            properties,
            `${tool.name}: ${path} names no top-level property of its outputSchema`
          ).toContain(firstSegment(path));
        }

        const declared = new Set(declaration.structuredPaths.map(firstSegment));
        const openUndeclared = properties.filter(
          (p) =>
            !declared.has(p) &&
            !OPEN_EXEMPT_PROPERTIES.has(p) &&
            isOpen(schemaProps[p], tool.outputSchema)
        );
        expect(
          openUndeclared,
          `${tool.name}: open outputSchema fields can carry raw platform objects; declare them`
        ).toEqual([]);
      }

      if (claimFor(pkg) === "per-response") {
        expect(
          undeclared,
          `${pkg} claims per-response, but these tools declare nothing; add untrustedContent`
        ).toEqual([]);
        expect(
          declarationsOf(tools),
          `${pkg}: declarations differ from untrusted-declarations.snapshot.json. If the change is intended, run \`pnpm sync:untrusted-declarations\``
        ).toEqual(snapshot[pkg]);
      } else {
        expect(
          snapshot[pkg],
          `${pkg} is pinned in untrusted-declarations.snapshot.json but does not claim per-response`
        ).toBeUndefined();
        expect(
          undeclared.length,
          `${pkg}: every tool declares; set untrustedContent.pathReporting to "per-response" in registry.json`
        ).toBeGreaterThan(0);
      }
    },
    120_000
  );
});
