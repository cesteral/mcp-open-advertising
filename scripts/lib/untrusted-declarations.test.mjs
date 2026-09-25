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
//     tool's published outputSchema, so a path cannot point at nothing.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const KEY = "cesteral/untrusted";
const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

const claimFor = (pkg) =>
  registry.servers.find((s) => s.package === pkg)?.untrustedContent?.pathReporting ?? "unsupported";

const firstSegment = (path) => /^\$\.([A-Za-z_][A-Za-z0-9_]*)/.exec(path)?.[1];

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

        const properties = Object.keys(tool.outputSchema?.properties ?? {});
        for (const path of declaration.structuredPaths) {
          expect(
            properties,
            `${tool.name}: ${path} names no top-level property of its outputSchema`
          ).toContain(firstSegment(path));
        }
      }

      if (claimFor(pkg) === "per-response") {
        expect(
          undeclared,
          `${pkg} claims per-response, but these tools declare nothing; add untrustedContent`
        ).toEqual([]);
      } else {
        expect(
          undeclared.length,
          `${pkg}: every tool declares; set untrustedContent.pathReporting to "per-response" in registry.json`
        ).toBeGreaterThan(0);
      }
    },
    120_000
  );
});
