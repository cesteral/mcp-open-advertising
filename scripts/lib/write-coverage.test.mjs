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

const readByDesign = JSON.parse(
  readFileSync(join(ROOT, "scripts", "lib", "read-by-design-allowlist.json"), "utf8")
).readByDesign;

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

// Mutation verbs that, as a whole token in a tool name, are a strong independent
// signal that the tool MUTATES external state. The write ratchet above keys "is a
// write" off the self-declared `readOnlyHint === false`; this name signal is a
// SECOND, independent axis so a write cannot dodge governance merely by declaring
// `readOnlyHint: true` (or by an author forgetting to set it false) — the name and
// the hint must agree. Whole-token (underscore-anchored) so "added"/"updated_at"/
// "settings" do not match. Genuine reads whose names contain such a token (async-job
// status pollers, getters) are enumerated in read-by-design-allowlist.json.
const MUTATION_NAME = new RegExp(
  "(^|_)(" +
    [
      "create", "update", "delete", "remove", "archive", "duplicate", "upload",
      "insert", "mutate", "mutation", "manage", "submit", "pause", "resume",
      "enable", "disable", "activate", "deactivate", "cancel", "rerun", "bulk",
      "import",
    ].join("|") +
    ")(_|$)"
);

function ungovernedWrites(tools) {
  return tools
    .filter((t) => {
      const ann = t.annotations ?? {};
      return ann.readOnlyHint === false && !ann.cesteral;
    })
    .map((t) => t.name)
    .sort();
}

// Tools whose NAME signals a mutation but which are NOT marked as a write
// (readOnlyHint !== false). Each must either be a real write (set readOnlyHint
// false + add a cesteral contract) or an explicit read-by-design exception.
function mutationNamedNonWrites(tools) {
  return tools
    .filter((t) => {
      const ann = t.annotations ?? {};
      return MUTATION_NAME.test(t.name) && ann.readOnlyHint !== false;
    })
    .map((t) => t.name)
    .sort();
}

// Every tool must declare readOnlyHint as an explicit boolean. An omitted hint is
// silently treated as "read" by the write ratchet, so requiring it closes the hole
// where a new tool dodges write-classification simply by leaving the hint unset.
function toolsMissingReadOnlyHint(tools) {
  return tools
    .filter((t) => typeof (t.annotations ?? {}).readOnlyHint !== "boolean")
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

// Mislabel ratchet — independent of the self-declared write flag.
//
// The coverage ratchet above trusts `readOnlyHint === false` to mean "write", so a
// mutating tool mislabeled `readOnlyHint: true` (or with the hint omitted) is
// invisible to it and ships ungoverned. This block cross-checks the tool NAME (an
// independent signal) against the hint: a mutation-named tool must be marked as a
// write, unless it is a genuine read explicitly listed in
// read-by-design-allowlist.json. Two-way, like the coverage ratchet:
//   - no mutation-named non-write may appear unless read-by-design-allowlisted
//   - no stale read-by-design entry may remain
// It also asserts every tool declares readOnlyHint explicitly.
describe("write-tool mislabel ratchet", () => {
  for (const pkg of packages) {
    it(`${pkg}: mutation-named tools are marked writes (or explicitly read-by-design), and readOnlyHint is always declared`, async () => {
      const tools = await withServerClient(pkg, listRawTools);

      // (0) readOnlyHint must be an explicit boolean on every tool.
      const missingHint = toolsMissingReadOnlyHint(tools);
      expect(
        missingHint,
        `Tool(s) in ${pkg} missing an explicit boolean readOnlyHint: ${missingHint.join(", ")} — ` +
          `declare readOnlyHint so write-classification can't be dodged by omission`
      ).toEqual([]);

      const flagged = mutationNamedNonWrites(tools);
      const readOk = [...(readByDesign[pkg] ?? [])].sort();

      // (1) A mutation-named tool that isn't a write must be read-by-design-listed.
      const suspect = flagged.filter((n) => !readOk.includes(n));
      expect(
        suspect,
        `Mutation-named tool(s) in ${pkg} not marked as writes: ${suspect.join(", ")} — ` +
          `if this MUTATES external state, set readOnlyHint:false + add a cesteral contract; ` +
          `if it is genuinely read-only (e.g. a status poller), add it to read-by-design-allowlist.json`
      ).toEqual([]);

      // (2) No stale read-by-design entries: each must still be a mutation-named non-write.
      const staleReadOk = readOk.filter((n) => !flagged.includes(n));
      expect(
        staleReadOk,
        `Stale read-by-design entr(ies) for ${pkg}: ${staleReadOk.join(", ")} — ` +
          `these are no longer mutation-named non-writes; remove them from read-by-design-allowlist.json`
      ).toEqual([]);
    });
  }
});
