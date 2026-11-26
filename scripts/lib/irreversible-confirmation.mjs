// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// "Does this tool confirm its irreversible path as irreversible?" — read from
// the tool's own definition file. Used by irreversible-confirmation.test.mjs.
//
// Static on purpose, like wire-request-coverage.mjs: the runtime behaviour is
// pinned per tool by each package's `*-terminal-confirmation-wire.test.ts`
// (`describeTerminalConfirmation` from @cesteral/shared/testkit); this only
// stops a destructive tool from shipping with no irreversible confirmation in
// its source at all, which is how the gaps this was written for arose.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";

/**
 * Calls that confirm as irreversible: with no elicitation channel they are
 * refused (elicitation-helpers.ts, `irreversible: true`). `findTerminalTransitions`
 * counts because its only consumers are irreversible confirmations
 * (`assertTerminalTransitionsConfirmed`, or `elicitBulkMutationConfirmation`'s
 * `terminalItems`).
 */
export const IRREVERSIBLE_CALLS = [
  "elicitDeleteConfirmation",
  "elicitBulkDeleteConfirmation",
  "elicitArchiveConfirmation",
  "elicitTerminalTransitionConfirmation",
  "elicitIrreversibleOperationConfirmation",
  "assertTerminalTransitionsConfirmed",
  "findTerminalTransitions",
];

/** A bulk status change counts only when its `irreversible` input is computed, not `false`. */
const COMPUTED_IRREVERSIBLE = /\birreversible:\s*(?!false\b)[A-Za-z_(]/;

/** Source without comments, so a helper named only in a comment does not count. */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const definitionsCache = new Map();

/** `{ file, source }` for each tool definition file of a package. */
function definitionsOf(pkg) {
  if (!definitionsCache.has(pkg)) {
    const dir = join(ROOT, "packages", pkg, "src", "mcp-server", "tools", "definitions");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".tool.ts"))
      .map((f) => ({
        file: join("packages", pkg, "src/mcp-server/tools/definitions", f),
        source: readFileSync(join(dir, f), "utf8"),
      }));
    definitionsCache.set(pkg, files);
  }
  return definitionsCache.get(pkg);
}

/**
 * The definition file that defines the tool: the one whose `TOOL_NAME` (or a
 * tool object's `name:`) is the name. Other files may quote the name (a
 * description pointing at it), so a bare literal is only the last resort.
 */
export function definitionFileOf(pkg, toolName) {
  const defs = definitionsOf(pkg);
  const patterns = [
    new RegExp(`\\bTOOL_NAME\\s*=\\s*["'\`]${toolName}["'\`]`),
    new RegExp(`\\bname:\\s*["'\`]${toolName}["'\`]`),
    new RegExp(`["'\`]${toolName}["'\`]`),
  ];
  for (const pattern of patterns) {
    const hit = defs.find((d) => pattern.test(d.source));
    if (hit) return hit;
  }
  return undefined;
}

/** The irreversible confirmations a source makes (names from IRREVERSIBLE_CALLS, plus `irreversible:`). */
export function irreversibleConfirmationsIn(source) {
  const code = stripComments(source);
  const found = IRREVERSIBLE_CALLS.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(code));
  if (/\belicitBulkStatusChangeConfirmation\s*\(/.test(code) && COMPUTED_IRREVERSIBLE.test(code)) {
    found.push("elicitBulkStatusChangeConfirmation(irreversible)");
  }
  return found;
}
