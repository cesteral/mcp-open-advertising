#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Generates dist/cesteral-manifest.json for every MCP server package that
// exposes governed tools (tools carrying an `annotations.cesteral` block).
// The manifest blesses each governed tool's definitionHash; npm provenance
// on the package tarball signs it transitively. Packages with no governed
// tools get no manifest file — governance treats absence as benign
// (`missing_manifest`).
//
// Output shape is the canonical `cesteralManifestSchema` from
// @cesteral/contract-schema — the same schema the governance layer verifies
// released manifests with, so the two sides cannot drift.
//
// Requires `pnpm run build` first.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, withServerClient, listRawTools } from "./lib/boot-server.mjs";
import { toManifestEntry, validateManifest } from "./lib/manifest.mjs";
import { assertManifestCoverage } from "./lib/governed-packages.mjs";

const REGISTRY = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf-8"));

async function generateForPackage(packageDir) {
  const pkg = JSON.parse(readFileSync(join(ROOT, "packages", packageDir, "package.json"), "utf-8"));
  const manifestPath = join(ROOT, "packages", packageDir, "dist", "cesteral-manifest.json");

  const tools = await withServerClient(packageDir, listRawTools);
  const entries = tools.map(toManifestEntry).filter((entry) => entry !== null);

  if (entries.length === 0) {
    // No governed tools — make sure no stale manifest ships in the tarball.
    if (existsSync(manifestPath)) rmSync(manifestPath);
    console.log(`  ${pkg.name}: no governed tools — no manifest`);
    return 0;
  }

  // Deterministic tool ordering so diffs across runs are minimal.
  entries.sort((a, b) => a.toolName.localeCompare(b.toolName));

  const manifest = {
    manifestVersion: 1,
    packageName: pkg.name,
    packageVersion: pkg.version,
    generatedAt: new Date().toISOString(),
    tools: entries,
  };
  validateManifest(manifest);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ${pkg.name}: wrote manifest with ${entries.length} governed tool(s)`);
  return entries.length;
}

async function main() {
  console.log("Generating cesteral-manifest.json for MCP server packages...");
  // Sequential by design: each boot loads a full server graph in-process.
  const entryCounts = {};
  for (const server of REGISTRY.servers) {
    entryCounts[server.package] = await generateForPackage(server.package);
  }

  // Cross-check the statically-declared governed set (registry.json `governed`
  // flag) against what generation actually produced. A declared-governed
  // package that produced no manifest is a regression that would ship a tarball
  // with no attestation manifest — silently fail-open downstream — so hard-fail
  // the release here instead.
  const coverageFailures = assertManifestCoverage({ registry: REGISTRY, entryCounts });
  if (coverageFailures.length > 0) {
    throw new Error(
      `Governed-package coverage check failed:\n` +
        coverageFailures.map((f) => `  - ${f}`).join("\n")
    );
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(
    `\nManifest generation failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
