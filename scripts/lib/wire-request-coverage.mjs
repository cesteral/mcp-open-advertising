// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// "Is this write tool exercised by a vendor-sourced wire-request test?" (#236)
//
// The wire-request suites (`packages/<pkg>/tests/**/*wire*.test.ts`) call a
// tool's real `*Logic` function over real session services with only `fetch`
// stubbed, and assert the exact upstream request against a cited vendor source
// (`// basis:` comments). This module answers, statically, which tools such a
// suite reaches; wire-request-coverage.test.mjs turns that into a ratchet.
//
// WHAT COUNTS AS A WIRE-REQUEST TEST FILE
//
// A file under the package's own `tests/` whose name contains `wire` and ends in
// `.test.ts`, AND that carries at least one `basis:` comment. The basis marker is
// what makes it vendor-sourced: dbm-mcp's `async-task-wire.test.ts` is about the
// MCP task wire, mocks the service layer, and cites no vendor, so it must not
// count; the shared package's `*-wire.test.ts` files are not per-tool at all.
//
// WHAT COUNTS AS "EXERCISED"
//
// Matching is on the TypeScript AST, so comments never count — a suite's header
// listing tools it deliberately does NOT cover ("Covered elsewhere: ...") must
// not mark them covered. A tool is covered when a qualifying file in ITS OWN
// package either
//   - CALLS one of the `*Logic` functions exported by the tool's definition file
//     (`createEntityLogic(...)`; an import alone does not count), or
//   - contains the tool's name as a string literal (a suite driving the tool
//     through `tools/call`, or a `describe("ttd_create_entity", ...)` label).
// Logic names like `createEntityLogic` repeat across packages, which is why the
// match is scoped to the tool's own package.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, keep, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, keep, acc);
    else if (keep(entry)) acc.push(full);
  }
  return acc;
}

/** True when `name` is a wire-request test file name. */
export function isWireTestFileName(name) {
  return name.endsWith(".test.ts") && name.includes("wire");
}

/** True when `source` cites a vendor source in a `basis:` comment. */
export function citesBasis(source) {
  return /\/\/[^\n]*\bbasis:|\/\*[\s\S]*?\bbasis:[\s\S]*?\*\//.test(source);
}

/**
 * The call targets and string literals a test file actually uses, comments
 * excluded.
 *
 * @param {string} source
 * @returns {{ calls: Set<string>, strings: Set<string> }}
 */
export function referencesIn(source) {
  const file = ts.createSourceFile("wire.test.ts", source, ts.ScriptTarget.Latest, false);
  const calls = new Set();
  const strings = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.add(node.expression.text);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      strings.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { calls, strings };
}

/**
 * Qualifying wire-request test files for a package, with what each references.
 *
 * @param {string} pkg - package directory name, e.g. "tiktok-mcp"
 * @returns {{ file: string, calls: Set<string>, strings: Set<string> }[]}
 */
export function wireTestFiles(pkg) {
  return walk(join(ROOT, "packages", pkg, "tests"), isWireTestFileName)
    .map((full) => ({ full, source: readFileSync(full, "utf8") }))
    .filter(({ source }) => citesBasis(source))
    .map(({ full, source }) => ({ file: full.slice(ROOT.length + 1), ...referencesIn(source) }));
}

const LOGIC_EXPORT =
  /export\s+(?:async\s+)?(?:function\s*\*?|const|let)\s*([A-Za-z_$][\w$]*Logic)\b/g;

const TOOL_NAME_CONST = /\bconst\s+TOOL_NAME\s*=\s*["'`]([a-z0-9_]+)["'`]/;

/**
 * Tool name → the `*Logic` functions exported by its definition file, for every
 * `*.tool.ts` that declares `const TOOL_NAME = "..."` (the fleet-wide
 * convention). Keyed on that constant, not on any string literal in the file,
 * because descriptions name neighbouring tools ("call ttd_get_entity first")
 * and must not lend them this file's Logic.
 *
 * @param {string} pkg
 * @returns {Map<string, string[]>}
 */
export function logicExportsByTool(pkg) {
  const files = walk(join(ROOT, "packages", pkg, "src", "mcp-server", "tools"), (n) =>
    n.endsWith(".tool.ts")
  );
  const byTool = new Map();
  for (const full of files) {
    const source = readFileSync(full, "utf8");
    const name = source.match(TOOL_NAME_CONST)?.[1];
    if (!name) continue;
    byTool.set(
      name,
      [...source.matchAll(LOGIC_EXPORT)].map((m) => m[1])
    );
  }
  return byTool;
}

/**
 * Which of `toolNames` a qualifying wire-request test in `pkg` exercises.
 *
 * @param {string} pkg
 * @param {string[]} toolNames
 * @returns {Map<string, string[]>} covered tool name → files that cover it
 */
export function coveredTools(pkg, toolNames) {
  const files = wireTestFiles(pkg);
  const logic = logicExportsByTool(pkg);
  const covered = new Map();
  for (const name of toolNames) {
    const by = files
      .filter((f) => f.strings.has(name) || (logic.get(name) ?? []).some((fn) => f.calls.has(fn)))
      .map((f) => f.file);
    if (by.length > 0) covered.set(name, by);
  }
  return covered;
}
