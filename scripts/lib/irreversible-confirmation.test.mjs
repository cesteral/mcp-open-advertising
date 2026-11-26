// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide irreversible-confirmation ratchet.
//
// Three sources say a tool can destroy something, and nothing tied them to the
// confirmations: the MCP hint (`destructiveHint`, scripts/lib/tool-hint-rules.mjs),
// registry.json's `operational.terminalOperations` (published on the server
// card), and the `elicit*Confirmation` calls in the handlers. A bulk status
// change that could archive was confirmed as reversible, so a client with no
// elicitation channel archived unconfirmed; several update and manage tools that
// can set a terminal status or delete asked nothing at all.
//
// This requires every tool that EITHER carries `destructiveHint: true` OR owns a
// registry terminal operation to make an irreversible confirmation in its
// definition file (irreversible-confirmation.mjs says what counts), or to be in
// irreversible-confirmation-allowlist.json with the reason it has no
// irreversible path. Two-way, like the other ratchets: an allowlisted tool that
// is now covered, no longer a candidate, or gone fails, so the list only shrinks.
//
// It also ties registry.json's `terminalStatusValues` (the one list the tools
// read, through `terminalStatusValuesFor`) to the tool surface: every
// irreversible-looking status a writing tool's schema offers must be declared
// terminal for its platform, or listed as reversible there with a reason.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";
import { toolsOf } from "./fleet-snapshot-inject.mjs";
import { irreversibleStatusOptions } from "./destructive-tools.mjs";
import {
  definitionFileOf,
  irreversibleConfirmationsIn,
  stripComments,
} from "./irreversible-confirmation.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const allowlist = JSON.parse(
  readFileSync(join(ROOT, "scripts", "lib", "irreversible-confirmation-allowlist.json"), "utf8")
);

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

const serverOf = (pkg) => registry.servers.find((s) => s.package === pkg);
const terminalToolsOf = (pkg) =>
  new Set((serverOf(pkg)?.operational?.terminalOperations ?? []).map((t) => t.tool));

/** Tools that must have an irreversible confirmation path, with why. */
function candidatesOf(pkg) {
  const terminal = terminalToolsOf(pkg);
  const out = new Map();
  for (const tool of toolsOf(pkg)) {
    const why = [];
    if (tool.annotations?.destructiveHint === true) why.push("destructiveHint");
    if (terminal.has(tool.name)) why.push("registry terminalOperations");
    if (why.length > 0) out.set(tool.name, why);
  }
  return out;
}

function coverageOf(pkg, toolName) {
  const def = definitionFileOf(pkg, toolName);
  return { def, calls: def ? irreversibleConfirmationsIn(def.source) : [] };
}

const exempt = (pkg) => allowlist.exempt.filter((e) => e.package === pkg);

describe("every destructive or terminal tool confirms its irreversible path", () => {
  it.each(packages)("%s: each candidate is covered or exempt, and only those are exempt", (pkg) => {
    const candidates = candidatesOf(pkg);
    const exempted = new Set(exempt(pkg).map((e) => e.tool));

    const missing = [];
    for (const [name, why] of candidates) {
      if (exempted.has(name)) continue;
      const { def, calls } = coverageOf(pkg, name);
      if (!def) missing.push(`${name} (${why.join(", ")}): no definition file names it`);
      else if (calls.length === 0) missing.push(`${name} (${why.join(", ")}) in ${def.file}`);
    }
    expect(
      missing,
      `${pkg}: tools that can make an irreversible change but never confirm one as irreversible. ` +
        `Confirm before the first upstream write (elicitDeleteConfirmation, ` +
        `assertTerminalTransitionsConfirmed, elicitBulkStatusChangeConfirmation with a computed ` +
        `\`irreversible\`, ...; docs/architecture/confirmation-mrtr.md), or list the tool in ` +
        `scripts/lib/irreversible-confirmation-allowlist.json with the reason it has no irreversible path.`
    ).toEqual([]);

    const stale = [];
    for (const entry of exempt(pkg)) {
      if (!candidates.has(entry.tool)) {
        stale.push(`${entry.tool}: no longer destructive, terminal, or advertised`);
        continue;
      }
      const { calls } = coverageOf(pkg, entry.tool);
      if (calls.length > 0) stale.push(`${entry.tool}: now confirms (${calls.join(", ")})`);
    }
    expect(
      stale,
      `${pkg}: stale irreversible-confirmation-allowlist.json entries — remove them`
    ).toEqual([]);
  });

  it("every exemption states its reason, once", () => {
    const seen = new Set();
    for (const entry of allowlist.exempt) {
      const key = `${entry.package}:${entry.tool}`;
      expect(seen.has(key), `duplicate exemption ${key}`).toBe(false);
      seen.add(key);
      expect(entry.reason?.length ?? 0, key).toBeGreaterThan(40);
    }
  });
});

describe("registry.json terminalStatusValues is the one list of terminal statuses", () => {
  it.each(packages)("%s: every irreversible status a writing tool offers is declared", (pkg) => {
    const declared = new Set(
      (serverOf(pkg)?.operational?.terminalStatusValues ?? []).map((v) => v.toUpperCase())
    );
    const reversible = new Set(
      allowlist.reversibleStatusValues
        .filter((e) => e.package === pkg)
        .map((e) => e.value.toUpperCase())
    );
    const undeclared = [];
    for (const tool of toolsOf(pkg)) {
      for (const value of irreversibleStatusOptions(tool)) {
        const v = value.toUpperCase();
        if (!declared.has(v) && !reversible.has(v)) undeclared.push(`${tool.name}: ${value}`);
      }
    }
    expect(
      undeclared,
      `${pkg}: add these to registry.json operational.terminalStatusValues, or list the value ` +
        `under reversibleStatusValues in irreversible-confirmation-allowlist.json with the call that reverses it.`
    ).toEqual([]);
  });

  it.each(packages)(
    "%s: every declared terminal status is named in a terminal-operation note",
    (pkg) => {
      const server = serverOf(pkg);
      const notes = (server?.operational?.terminalOperations ?? []).map((t) => t.note).join("\n");
      for (const value of server?.operational?.terminalStatusValues ?? []) {
        expect(notes.includes(value), `${pkg}: ${value} is in no terminalOperations note`).toBe(
          true
        );
      }
    }
  );

  it.each(packages)(
    "%s: a tool that reads terminalStatusValuesFor(TOOL_NAME) is declared terminal",
    (pkg) => {
      const terminal = terminalToolsOf(pkg);
      const dir = join(ROOT, "packages", pkg, "src", "mcp-server", "tools", "definitions");
      const undeclared = [];
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".tool.ts"))) {
        const code = stripComments(readFileSync(join(dir, file), "utf8"));
        if (!/\bterminalStatusValuesFor\s*\(\s*TOOL_NAME\s*\)/.test(code)) continue;
        const name = code.match(/const TOOL_NAME = "([a-z0-9_]+)"/)?.[1];
        if (!name || !terminal.has(name)) undeclared.push(`${file} (${name ?? "no TOOL_NAME"})`);
      }
      // Boot would already have thrown (terminalStatusValuesFor checks the
      // registry at module load); this names the file instead.
      expect(undeclared).toEqual([]);
    }
  );

  it("every reversible-status exemption states the call that reverses it, once", () => {
    const seen = new Set();
    for (const entry of allowlist.reversibleStatusValues) {
      const key = `${entry.package}:${entry.value}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
      expect(entry.reason?.length ?? 0, key).toBeGreaterThan(40);
      const declared = (serverOf(entry.package)?.operational?.terminalStatusValues ?? []).map((v) =>
        v.toUpperCase()
      );
      expect(declared.includes(entry.value.toUpperCase()), `${key} is also declared terminal`).toBe(
        false
      );
    }
  });
});

describe("irreversibleConfirmationsIn", () => {
  it("counts an irreversible helper call, not a mention in a comment", () => {
    expect(irreversibleConfirmationsIn("await elicitDeleteConfirmation({})")).toEqual([
      "elicitDeleteConfirmation",
    ]);
    expect(irreversibleConfirmationsIn("// elicitDeleteConfirmation(...)")).toEqual([]);
    expect(irreversibleConfirmationsIn("/* assertTerminalTransitionsConfirmed( */")).toEqual([]);
  });

  it("counts a bulk status change only with a computed `irreversible`", () => {
    expect(
      irreversibleConfirmationsIn("elicitBulkStatusChangeConfirmation({ irreversible: false })")
    ).toEqual([]);
    expect(
      irreversibleConfirmationsIn(
        "elicitBulkStatusChangeConfirmation({ irreversible: isTerminalStatusValue(T, s) })"
      )
    ).toEqual(["elicitBulkStatusChangeConfirmation(irreversible)"]);
  });

  it("does not count a reversible helper", () => {
    expect(irreversibleConfirmationsIn("elicitBidChangeConfirmation({})")).toEqual([]);
    expect(irreversibleConfirmationsIn("elicitBulkMutationConfirmation({})")).toEqual([]);
  });
});
