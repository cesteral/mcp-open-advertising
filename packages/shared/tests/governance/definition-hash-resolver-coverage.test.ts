// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Every governed server wires a `definitionHash` resolver — sweep 2026-07-25, 10-F3.
 *
 * `registerToolsFromDefinitions` takes an optional `resolveDefinitionHash`. When
 * it is absent the decision-token verifier has nothing to compare the token's
 * `definitionHash` claim against, so it reports `definitionHashVerified: false`.
 * Under `warn` that binding is simply unchecked; under `enforce` it fails closed
 * — a 100% write outage for that server the moment its posture is raised.
 *
 * sa360-mcp shipped without it while the other eleven governed servers had it.
 * That lands badly: per CLAUDE.md sa360's ONLY governed writes are the offline
 * conversion upload/modify (`insert_conversions` / `update_conversions`), so the
 * gap covered all of them.
 *
 * The check is driven off `registry.json`'s `governed` flag rather than a
 * hand-kept list, because that flag is already the declared intent — it is what
 * `assertManifestCoverage` uses to decide which packages must ship a signed
 * `dist/cesteral-manifest.json`, which is the very file the resolver reads. A
 * server declared governed but not wired cannot verify the manifest it ships.
 *
 * dbm-mcp is deliberately `governed: false` — its six annotated tools are all
 * `readOnlyHint: true`, no manifest is generated for it, and wiring a resolver
 * there would read a file that never exists and quietly resolve nothing. The
 * inverse assertion below pins that so the two cases cannot be conflated.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");

interface Registry {
  servers: Array<{ package: string; governed?: boolean }>;
}

const registry: Registry = JSON.parse(
  readFileSync(resolve(repoRoot, "registry.json"), "utf8")
) as Registry;

const governed = registry.servers.filter((s) => s.governed === true).map((s) => s.package);
const ungoverned = registry.servers.filter((s) => s.governed !== true).map((s) => s.package);

function serverSource(pkg: string): string {
  const path = resolve(repoRoot, "packages", pkg, "src/mcp-server/server.ts");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("definitionHash resolver coverage (10-F3)", () => {
  it("finds the governed servers it is meant to check", () => {
    // Guards the guard: an empty list would make every assertion below vacuous.
    expect(governed.length).toBeGreaterThan(5);
  });

  it.each(governed)("%s wires resolveDefinitionHash", (pkg) => {
    const src = serverSource(pkg);
    expect(src, `${pkg} has no src/mcp-server/server.ts`).not.toBe("");
    expect(
      /resolveDefinitionHash:\s*createDefinitionHashResolver\(/.test(src),
      `${pkg} is declared governed in registry.json but does not pass ` +
        `resolveDefinitionHash to registerToolsFromDefinitions. The decision-token ` +
        `verifier then reports definitionHashVerified: false — unchecked under warn, ` +
        `and a total write outage under enforce.`
    ).toBe(true);
  });

  it.each(ungoverned)("%s does NOT wire a resolver it has no manifest for", (pkg) => {
    // An ungoverned package ships no `dist/cesteral-manifest.json`, so a resolver
    // there reads a missing file and returns an empty map — coverage in
    // appearance only. If a package becomes governed, flip the registry flag and
    // this test moves it to the assertion above.
    const src = serverSource(pkg);
    if (src === "") return;
    expect(
      /resolveDefinitionHash:\s*createDefinitionHashResolver\(/.test(src),
      `${pkg} is declared ungoverned in registry.json, so no manifest is generated ` +
        `for it and this resolver can only ever resolve nothing. Either set ` +
        `governed: true in registry.json, or drop the wiring.`
    ).toBe(false);
  });
});
