// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// #211 Gap 2: resource execution surfaces.
//
// TRIAGE RESULT — why this is a ratchet and not a classification system
//
// The issue asked for triage before design: how many of the 65
// `resources/definitions/*.resource.ts` files read tenant-scoped data, versus
// returning static documentation? The answer is ZERO, and not merely because a
// grep found nothing (that is what #193 got wrong — it scanned a directory
// containing no resource definitions at all and reported 329 files).
//
// It is zero for a STRUCTURAL reason, which is a much stronger claim: the
// resource handler signatures in `resource-handler-factory.ts` are
// `(uri: URL)` and `(uri: URL, variables: Record<string, string | string[]>)`.
// No session id, no auth info, no SDK context is passed to a resource definition
// at all. A `*.resource.ts` file cannot resolve session services because it is
// handed nothing to resolve them from.
//
// THE ONE TENANT-SCOPED RESOURCE IS NOT IN THAT DIRECTORY
//
// `report-csv://{id}` reaches tenant data — it serves spilled report bodies. It
// is registered by `report-csv-resource.ts`, takes `extra?: { sessionId }`, and
// already rejects a read whose entry belongs to another session
// (`entry.sessionId !== callerSessionId`). That binding is pinned by #184's
// tests across the GCS mirror. So the surface that needed guarding was already
// guarded, and it was never one of the 65.
//
// WHAT THIS FILE DOES
//
// Keeps the structural property true. If someone later threads session state
// into a resource definition, this fails and forces the design conversation the
// issue wanted to avoid having speculatively. That is the whole guard: no
// taxonomy, no per-file annotations, no declaration burden — #212 covering 304
// tool files with zero annotations is the evidence that the mechanical route
// goes further.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";

function resourceDefinitionFiles() {
  const files = [];
  for (const pkg of readdirSync(join(ROOT, "packages")).filter((p) => p.endsWith("-mcp"))) {
    const dir = join(ROOT, "packages", pkg, "src/mcp-server/resources/definitions");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".resource.ts"))) {
      files.push({ pkg, file: f, path: join(dir, f) });
    }
  }
  return files;
}

/**
 * Ways a resource definition could reach tenant-scoped state. Each is a real
 * accessor in this fleet, not a guess: `resolveSessionServices` is the tool-side
 * entry point, `sessionServiceStore` is the map behind it, and the rest are the
 * per-platform scope identifiers `check:account-scope` already keys on.
 */
const SESSION_ACCESS = [
  "resolveSessionServices",
  "sessionServiceStore",
  "getSessionServices",
  "SessionServiceStore",
];

const files = resourceDefinitionFiles();

describe("resource definitions are documentation, not execution surfaces (#211 Gap 2)", () => {
  it("finds the resource definitions (a zero here would make every other assertion vacuous)", () => {
    // #193 reported on a directory that contained none. An audit that scans
    // nothing passes loudly, so assert the corpus is non-empty first.
    expect(files.length).toBeGreaterThanOrEqual(60);
  });

  it.each(SESSION_ACCESS)("no resource definition references %s", (accessor) => {
    const offenders = files
      .filter(({ path }) => readFileSync(path, "utf-8").includes(accessor))
      .map(({ pkg, file }) => `${pkg}/${file}`);

    expect(
      offenders,
      `A resource definition now reaches session state via ${accessor}. Resource handlers ` +
        `receive only (uri, variables) — no session, no auth context — so resources have never ` +
        `been a tenant-scoped execution surface and nothing audits them. If this is deliberate, ` +
        `the scope check in scripts/lib/account-scope-audit.mjs must be extended to cover ` +
        `resources BEFORE this lands. See #211.`
    ).toEqual([]);
  });

  it("the resource handler signature still carries no session context", () => {
    // The structural fact the assertions above rest on. If the factory starts
    // passing an `extra`/context argument to resource definitions, the reason
    // they are safe disappears and the guard above stops meaning anything.
    const factory = readFileSync(
      join(ROOT, "packages/shared/src/utils/resource-handler-factory.ts"),
      "utf-8"
    );
    expect(factory).toContain("handler: (uri: URL) => Promise<{");
    expect(factory).toMatch(
      /handler: \(\s*uri: URL,\s*variables: Record<string, string \| string\[\]>\s*\)/
    );
    expect(factory).not.toContain("sessionId");
  });

  it("report-csv:// — the one tenant-scoped resource — still enforces its session binding", () => {
    // Registered outside resources/definitions, so the guard above does not see
    // it. Asserted here so the triage conclusion ("the tenant-scoped surface is
    // already guarded") cannot quietly stop being true.
    const src = readFileSync(
      join(ROOT, "packages/shared/src/utils/report-csv-resource.ts"),
      "utf-8"
    );
    expect(src).toContain("extra?: { sessionId?: string }");
    expect(src).toMatch(/entry\.sessionId !== undefined && entry\.sessionId !== callerSessionId/);
  });
});
