// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide write-tool governance coverage ratchet.
//
// Boots each built server, lists its tools over the real tools/list wire, and
// for every WRITE tool (annotations.readOnlyHint === false) asserts it EITHER
// carries a cesteral governance contract OR is in the explicit allowlist of
// not-yet-migrated writes. Two-way ratchet:
//   - no NEW ungoverned writes may appear (anything not allowlisted must be governed)
//   - no STALE allowlist entries may remain (a governed/removed tool must leave the list)
// As tools are migrated to the entity/effect contract, remove them from
// scripts/lib/ungoverned-writes-allowlist.json. Goal: empty allowlist.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";

const allowlist = JSON.parse(
  readFileSync(join(ROOT, "scripts", "lib", "ungoverned-writes-allowlist.json"), "utf8")
).ungoverned;

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

function ungovernedWrites(tools) {
  return tools
    .filter((t) => {
      const ann = t.annotations ?? {};
      return ann.readOnlyHint === false && !ann.cesteral;
    })
    .map((t) => t.name)
    .sort();
}

describe("write-tool governance coverage ratchet", () => {
  for (const pkg of packages) {
    it(`${pkg}: every write tool is governed or explicitly allowlisted`, async () => {
      const tools = await withServerClient(pkg, listRawTools);
      const ungoverned = ungovernedWrites(tools);
      const allowed = [...(allowlist[pkg] ?? [])].sort();

      // (1) No new ungoverned writes: anything ungoverned must be allowlisted.
      const unexpected = ungoverned.filter((n) => !allowed.includes(n));
      expect(
        unexpected,
        `New ungoverned write tool(s) in ${pkg}: ${unexpected.join(", ")} — ` +
          `add a cesteral contract or add to ungoverned-writes-allowlist.json`
      ).toEqual([]);

      // (2) No stale allowlist entries: every allowlisted tool must still be an
      // ungoverned write (forces removal once a tool is governed or deleted).
      const stale = allowed.filter((n) => !ungoverned.includes(n));
      expect(
        stale,
        `Stale allowlist entr(ies) for ${pkg}: ${stale.join(", ")} — ` +
          `these are no longer ungoverned writes; remove them from ungoverned-writes-allowlist.json`
      ).toEqual([]);
    });
  }
});
