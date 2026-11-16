// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uncoveredWrites } from "./uncovered-writes.mjs";

// A stand-in tree whose boot helper imports the package's built output the
// way scripts/lib/boot-server.mjs does: a plain import(), which Node caches.
function stubTree() {
  const tree = mkdtempSync(join(tmpdir(), "uncovered-writes-"));
  mkdirSync(join(tree, "scripts/lib"), { recursive: true });
  writeFileSync(
    join(tree, "scripts/lib/boot-server.mjs"),
    [
      'import { join } from "node:path";',
      'import { pathToFileURL } from "node:url";',
      'const ROOT = join(import.meta.dirname, "..", "..");',
      "export async function withServerClient(pkg, fn) {",
      '  const mod = await import(pathToFileURL(join(ROOT, "packages", pkg, "dist", "tools.mjs")).href);',
      "  return fn(mod.tools);",
      "}",
      "export async function listRawTools(tools) {",
      "  return tools;",
      "}",
      "",
    ].join("\n")
  );
  writeFileSync(
    join(tree, "scripts/lib/wire-request-coverage.mjs"),
    "export function coveredTools() {\n  return new Map();\n}\n"
  );
  return tree;
}

function build(tree, tools) {
  const dist = join(tree, "packages/zz-mcp/dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "tools.mjs"), `export const tools = ${JSON.stringify(tools)};\n`);
}

const read = { name: "zz_get_report", annotations: { readOnlyHint: true } };
const write = { name: "zz_submit_report", annotations: { readOnlyHint: false } };

describe("scaffold smoke: uncovered writes", () => {
  let tree;
  afterEach(() => rmSync(tree, { recursive: true, force: true }));

  it("sees a rebuild of the same package (the staged leg's second stage)", async () => {
    tree = stubTree();
    build(tree, [read]);
    expect(await uncoveredWrites(tree, "zz-mcp")).toEqual([]);
    build(tree, [read, write]);
    expect(await uncoveredWrites(tree, "zz-mcp")).toEqual(["zz_submit_report"]);
  });
});
