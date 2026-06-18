// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Behavioral write-detection for the governance coverage ratchet.
//
// The coverage ratchet (write-coverage.test.mjs) decides "this tool is a write
// that must be governed" from the tool's SELF-DECLARED `annotations.readOnlyHint
// === false`. A handler that mutates live ad-platform state but is mislabeled
// `readOnlyHint: true` (or omits the hint) is invisible to that ratchet — it is
// not required to carry a `cesteral` block, yet the test passes (issue #107).
//
// This module adds a coarse behavioral cross-check: it statically detects tools
// whose handler reaches an UNAMBIGUOUS mutating HTTP verb (PUT / PATCH / DELETE)
// and asserts they are labeled `readOnlyHint: false`. That converts the highest-
// blast-radius mislabel (a destructive call wearing a read-only hint) from
// author-trust into detected-behavior.
//
// Deliberately a SOUND SUBSET, not exhaustive:
//   - POST is NOT treated as a write signal. Many reads legitimately POST
//     (GraphQL queries, search endpoints, async report submission), so a POST
//     is not sound evidence of mutation. POST-only writes (e.g. Google Ads
//     `mutate`, TikTok, Meta entity *updates*) still rest on the annotation
//     ratchet — this check never weakens it, only adds an independent net.
//   - Verb calls are matched only on HTTP-client receivers, so JS `Map`/`Set`
//     `.delete()` (caches, visited-sets) is not mistaken for an HTTP delete.
//   - One hop of indirection is resolved: a tool that calls a service method
//     whose body issues a PUT/PATCH/DELETE is detected. Deeper call chains are
//     not traced (a sound subset may miss them — it must never false-positive).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Repository root (scripts/lib/ → repo root). Derived locally rather than
// imported from boot-server.mjs so this purely-static check carries no
// dependency on the server-boot harness (which pulls in the MCP SDK).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// An HTTP method literal in a request-config object: `method: "DELETE"`.
const HTTP_METHOD_LITERAL = /method\s*:\s*["'`](DELETE|PUT|PATCH)["'`]/;

// A PUT/PATCH/DELETE call on an HTTP-client-shaped receiver (httpClient, client,
// apiClient, http, fetch, axios, request, ...). Receiver-scoped so that
// `someMap.delete(key)` / `cache.delete(id)` are NOT matched.
const HTTP_CLIENT_VERB_CALL =
  /\b\w*(?:[Cc]lient|[Hh]ttp|[Aa]pi|fetch|axios|[Rr]equest)\w*\.(?:delete|put|patch)\s*\(/;

/** True if `source` contains an unambiguous mutating-write signal. */
export function hasUnambiguousWrite(source) {
  return HTTP_METHOD_LITERAL.test(source) || HTTP_CLIENT_VERB_CALL.test(source);
}

function isSkippableDir(name) {
  return (
    name === "node_modules" ||
    name === "dist" ||
    name === "__tests__" ||
    name === "testkit" ||
    name === "__mocks__"
  );
}

function walkTsFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!isSkippableDir(entry)) walkTsFiles(full, acc);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

// Identify class-method / function spans in a service file and return the names
// of those whose body contains an unambiguous write. Spans run from one
// declaration line to the next (tight enough that a method's verbs stay within
// its own body), so a write in `deleteEntity` is not attributed to `getEntity`.
function mutatingMethodNames(source) {
  const lines = source.split("\n");
  const classMethod =
    /^(?:  |\t)(?:public |private |protected |readonly )*(?:static )?(?:async )?(?:get |set )?([A-Za-z_]\w*)\s*[(<]/;
  const fnDecl = /^(?:export )?(?:async )?function\s+([A-Za-z_]\w*)\s*[(<]/;
  const constFn =
    /^(?:export )?const\s+([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?\(/;
  const NON_METHODS = new Set(["if", "for", "while", "switch", "catch", "return", "constructor"]);

  const starts = [];
  lines.forEach((line, i) => {
    const m = line.match(classMethod) || line.match(fnDecl) || line.match(constFn);
    if (m && !NON_METHODS.has(m[1])) starts.push({ name: m[1], line: i });
  });

  const mutating = new Set();
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s].line;
    const to = s + 1 < starts.length ? starts[s + 1].line : lines.length;
    if (hasUnambiguousWrite(lines.slice(from, to).join("\n"))) mutating.add(starts[s].name);
  }
  return mutating;
}

// `readOnlyHint` as declared in the tool's annotations: true | false | undefined
// (undefined = the hint is omitted entirely).
function readOnlyHintOf(source) {
  const m = source.match(/readOnlyHint\s*:\s*(true|false)/);
  return m ? m[1] === "true" : undefined;
}

function toolNameOf(source, fallback) {
  const constName = source.match(/const\s+TOOL_NAME\s*=\s*["'`]([^"'`]+)["'`]/);
  if (constName) return constName[1];
  const inlineName = source.match(/\bname\s*:\s*["'`]([a-z0-9_]+)["'`]/i);
  if (inlineName) return inlineName[1];
  return fallback;
}

/**
 * Detect every tool in a package whose handler reaches an unambiguous mutating
 * verb (PUT / PATCH / DELETE), regardless of how it is labeled.
 *
 * @param {string} pkg - package directory name, e.g. "meta-mcp"
 * @returns {{ tool: string, file: string, readOnlyHint: boolean|undefined,
 *             inline: boolean, viaMethods: string[] }[]}
 */
export function detectWriteTools(pkg) {
  const srcDir = join(ROOT, "packages", pkg, "src");
  const files = walkTsFiles(srcDir);
  const toolFiles = files.filter((f) => f.endsWith(".tool.ts"));
  const serviceFiles = files.filter((f) => !f.endsWith(".tool.ts"));

  // Package-wide set of method names that unambiguously mutate.
  const mutating = new Set();
  for (const f of serviceFiles) {
    for (const name of mutatingMethodNames(readFileSync(f, "utf8"))) mutating.add(name);
  }

  const detected = [];
  for (const file of toolFiles) {
    const source = readFileSync(file, "utf8");
    const inline = hasUnambiguousWrite(source);
    const viaMethods = [...mutating].filter((name) => new RegExp(`\\.${name}\\s*\\(`).test(source));
    if (inline || viaMethods.length > 0) {
      detected.push({
        tool: toolNameOf(source, file.slice(srcDir.length + 1)),
        file: file.slice(ROOT.length + 1),
        readOnlyHint: readOnlyHintOf(source),
        inline,
        viaMethods,
      });
    }
  }
  return detected;
}

/**
 * The subset of {@link detectWriteTools} that is NOT declared
 * `readOnlyHint: false` — i.e. mutating handlers wearing a read-only (or
 * omitted) hint, which would slip past the coverage ratchet.
 *
 * @param {string} pkg - package directory name, e.g. "meta-mcp"
 */
export function findMislabeledWrites(pkg) {
  return detectWriteTools(pkg).filter((t) => t.readOnlyHint !== false);
}

/** Every `*-mcp` package directory, sorted. */
export function mcpPackages() {
  return readdirSync(join(ROOT, "packages"))
    .filter((p) => p.endsWith("-mcp"))
    .sort();
}
