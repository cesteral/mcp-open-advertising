// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide wire-request coverage ratchet (#236).
//
// Ten servers gained vendor-sourced wire-request suites: tests that call a
// tool's real logic with only `fetch` stubbed and assert the exact upstream
// method, URL and body against a cited vendor source. Nothing stopped a new
// write tool shipping without one, or an edit dropping a tool from its suite.
// This boots each built server, takes its write tools from the live tools/list,
// and requires each to be exercised by a wire-request test in its own package
// (see wire-request-coverage.mjs for what "exercised" means) or to be listed in
// wire-request-coverage-allowlist.json. Two-way, like the other ratchets:
//   - an uncovered write tool that is not allowlisted fails
//   - an allowlist entry whose tool is now covered, is no longer a write, or no
//     longer exists fails, so the list only shrinks
//
// WHY "WRITE" IS `readOnlyHint === false`
//
// The wire suites exist for requests that change platform state — the ones
// whose shape a mock cannot vouch for and whose mistakes cost money. The
// fleet's own definition of such a tool is `readOnlyHint === false`: the
// write-coverage ratchet requires the hint on every tool, cross-checks it
// against mutation verbs in the name, and requires every such tool to carry a
// `cesteral` governance block (today the two sets are identical). Keying on the upstream HTTP method instead would be both wider
// and narrower: reads POST too (GraphQL queries, targeting search, report
// polling), and write-behavior.mjs documents why a static method scan can only
// ever be a sound subset. A write tool that never issues an upstream request
// has nothing to assert on the wire; it goes in the allowlist's `noUpstream`
// list with its reason, never silently skipped.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";
import { citesBasis, coveredTools, referencesIn } from "./wire-request-coverage.mjs";

const allowlist = JSON.parse(
  readFileSync(join(ROOT, "scripts", "lib", "wire-request-coverage-allowlist.json"), "utf8")
);

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

const entriesFor = (list, pkg) => list.filter((e) => e.package === pkg).map((e) => e.tool);

async function writeToolsOf(pkg) {
  const tools = await withServerClient(pkg, listRawTools);
  return {
    live: new Set(tools.map((t) => t.name)),
    writes: tools.filter((t) => t.annotations?.readOnlyHint === false).map((t) => t.name),
  };
}

describe("every write tool is exercised by a vendor-sourced wire-request test", () => {
  it.each(packages)("%s: uncovered write tools are allowlisted, and only those", async (pkg) => {
    const { live, writes } = await writeToolsOf(pkg);
    const covered = coveredTools(pkg, writes);
    const uncoveredAllowed = new Set(entriesFor(allowlist.uncovered, pkg));
    const noUpstream = new Set(entriesFor(allowlist.noUpstream, pkg));

    const missing = writes.filter(
      (name) => !covered.has(name) && !uncoveredAllowed.has(name) && !noUpstream.has(name)
    );
    expect(
      missing,
      `${pkg}: write tool(s) with no wire-request test. Add a call to the tool's *Logic ` +
        `function in a // basis:-citing tests/**/*wire*.test.ts of ${pkg}, or (only if it ` +
        `never calls upstream) list it under noUpstream in wire-request-coverage-allowlist.json.`
    ).toEqual([]);

    const nowCovered = [...uncoveredAllowed].filter((name) => covered.has(name));
    expect(
      nowCovered,
      `${pkg}: allowlisted as uncovered but now covered by ${nowCovered
        .map((n) => covered.get(n).join(", "))
        .join("; ")} — remove from wire-request-coverage-allowlist.json`
    ).toEqual([]);

    const writeSet = new Set(writes);
    const stale = [...uncoveredAllowed, ...noUpstream].filter((name) => !writeSet.has(name));
    expect(
      stale,
      `${pkg}: allowlisted tool(s) that ${stale.some((n) => live.has(n)) ? "are no longer writes or " : ""}` +
        `no longer exist — remove from wire-request-coverage-allowlist.json`
    ).toEqual([]);

    const noUpstreamButCovered = [...noUpstream].filter((name) => covered.has(name));
    expect(
      noUpstreamButCovered,
      `${pkg}: listed as noUpstream yet a wire-request test exercises it — remove the entry`
    ).toEqual([]);
  });

  it("every allowlist entry names a known package and states a reason", () => {
    for (const entry of [...allowlist.uncovered, ...allowlist.noUpstream]) {
      expect(packages, `${entry.package}:${entry.tool}`).toContain(entry.package);
      expect(entry.reason?.length ?? 0, `${entry.package}:${entry.tool}`).toBeGreaterThan(20);
    }
    const keys = [...allowlist.uncovered, ...allowlist.noUpstream].map(
      (e) => `${e.package}:${e.tool}`
    );
    expect(
      keys.filter((k, i) => keys.indexOf(k) !== i),
      "duplicate entries"
    ).toEqual([]);
  });
});

describe("wire-request-coverage matcher", () => {
  it("counts calls and string literals but not imports or comments", () => {
    const { calls, strings } = referencesIn(`
      // Covered elsewhere: \`x_submit_report\`, submitReportLogic(
      /* deleteEntityLogic() */
      import { createEntityLogic, updateEntityLogic } from "../src/x.js";
      await createEntityLogic({}, ctx);
      describe("x_bulk_update_status", () => {});
      const url = \`https://api.example.com/\${id}\`;
    `);
    expect(calls.has("createEntityLogic")).toBe(true);
    expect(calls.has("updateEntityLogic")).toBe(false);
    expect(calls.has("submitReportLogic")).toBe(false);
    expect(calls.has("deleteEntityLogic")).toBe(false);
    expect(strings.has("x_bulk_update_status")).toBe(true);
    expect(strings.has("x_submit_report")).toBe(false);
  });

  it("requires a basis citation for a file to count as vendor-sourced", () => {
    expect(citesBasis("// basis: TikTok SDK api/campaign_api.py campaign_create")).toBe(true);
    expect(citesBasis("/**\n * basis: unified-api-dsp.json\n */")).toBe(true);
    expect(citesBasis('const basis = "x"; // the base')).toBe(false);
  });
});
