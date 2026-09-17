// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide terminal-operation coverage ratchet (#201).
//
// The server card's `operational.rollback.terminalOperations` is the ONE
// hand-authored value in the operational envelope — every other field is
// derived from the live rate limiter or probed off the real retry predicate.
// So it is the one field that can drift, and this is what stops it.
//
// Boots each built server, lists its tools over the real tools/list wire, and
// for every tool that looks destructive asserts it EITHER appears in that
// server's registry `terminalOperations` OR is in the explicit allowlist of
// operations we have established are reversible. Two-way ratchet:
//   - no NEW destructive tool may ship undeclared (anything not allowlisted
//     must be declared terminal)
//   - no STALE declaration may remain (a declared tool must still exist and
//     still look destructive)
//
// WHY THE CANDIDATE SET IS A UNION
//
// The obvious candidate rule — "annotation declares operation delete/archive"
// — misses seven of the fleet's sixteen destructive tools. `tiktok_delete_entity`,
// `pinterest_delete_entity`, `snapchat_delete_entity`, `msads_delete_entity` and
// `amazon_dsp_delete_entity` all declare `operation: ["bulk_job"]`, and
// `cm360_delete_entity` / `dv360_delete_assigned_targeting` declare `["manage"]`.
// That is deliberate and documented inline in each: they are `writeClass: "effect"`
// bulk deletes governed as one batch effect, with no canonical per-entity
// snapshot. The canonical operation taxonomy describes the GOVERNANCE shape, not
// the destructiveness, so keying a safety ratchet on it alone would have silently
// exempted exactly the tools that delete the most at once.
//
// The name axis catches those. Keying on both, as the write-coverage ratchet
// already does for readOnlyHint-vs-name, means a destructive tool has to defeat
// two independent signals to ship undeclared.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";
import { isDestructiveCandidate } from "./destructive-tools.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

const reversible = JSON.parse(
  readFileSync(join(ROOT, "scripts", "lib", "reversible-operations-allowlist.json"), "utf8")
).reversible;

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

function declaredFor(pkg) {
  const entry = registry.servers.find((s) => s.package === pkg);
  return entry?.operational?.terminalOperations ?? [];
}

describe("terminal-operation declarations match the shipped tool surface", () => {
  it("every registry server declares an operational block", () => {
    for (const server of registry.servers) {
      expect(server.operational?.terminalOperations, `${server.package}`).toBeInstanceOf(Array);
    }
  });

  it.each(packages)(
    "%s: every destructive tool is declared terminal or allowlisted",
    async (pkg) => {
      const tools = await withServerClient(pkg, listRawTools);
      const declared = new Set(declaredFor(pkg).map((t) => t.tool));
      const allowed = new Set(reversible.filter((r) => r.package === pkg).map((r) => r.tool));

      const undeclared = tools
        .filter(isDestructiveCandidate)
        .map((t) => t.name)
        .filter((name) => !declared.has(name) && !allowed.has(name));

      expect(
        undeclared,
        `${pkg}: destructive tools missing from registry.servers[].operational.terminalOperations. ` +
          `Declare them there, or add them to scripts/lib/reversible-operations-allowlist.json ` +
          `with the reason they are reversible.`
      ).toEqual([]);
    }
  );

  it.each(packages)("%s: no stale terminal declaration", async (pkg) => {
    const tools = await withServerClient(pkg, listRawTools);
    const live = new Map(tools.map((t) => [t.name, t]));

    for (const entry of declaredFor(pkg)) {
      expect(
        live.has(entry.tool),
        `${pkg}: declares terminal tool "${entry.tool}" which the server does not advertise`
      ).toBe(true);
      expect(
        entry.note.length,
        `${pkg}: "${entry.tool}" needs a note explaining why it is terminal`
      ).toBeGreaterThan(20);
      expect(
        entry.operations.length,
        `${pkg}: "${entry.tool}" declares no operations`
      ).toBeGreaterThan(0);
    }
  });

  it("no stale allowlist entry", async () => {
    const stale = [];
    for (const pkg of packages) {
      const tools = await withServerClient(pkg, listRawTools);
      const live = new Set(tools.map((t) => t.name));
      for (const entry of reversible.filter((r) => r.package === pkg)) {
        if (!live.has(entry.tool)) stale.push(`${pkg}:${entry.tool}`);
      }
    }
    expect(stale, "allowlisted tools that no longer exist — remove them").toEqual([]);
  });

  it("every allowlist entry states why the operation is reversible", () => {
    for (const entry of reversible) {
      expect(entry.reason?.length ?? 0, `${entry.package}:${entry.tool}`).toBeGreaterThan(20);
    }
  });
});
