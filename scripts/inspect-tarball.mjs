#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Inspects a packed .tgz tarball for two pre-publish failure modes:
//   1. Unresolved `workspace:` dependency ranges in the manifest. pnpm publish
//      should have rewritten these; their presence means the wrong publisher
//      was used and the tarball would break npm consumers.
//   2. LICENSE.md missing from the tarball file list, despite the manifest's
//      `files` array claiming it ships.
//
// Usage: node scripts/inspect-tarball.mjs <path-to-tarball.tgz>
// Exits 0 on success, 1 on any failure with a human-readable message on stderr.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const tarball = process.argv[2];
if (!tarball || !existsSync(tarball)) {
  console.error(`inspect-tarball: tarball not found: ${tarball ?? "(missing arg)"}`);
  process.exit(1);
}

const manifestRaw = execFileSync("tar", ["-xzOf", tarball, "package/package.json"], {
  encoding: "utf8",
});
const manifest = JSON.parse(manifestRaw);
const fileList = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const failures = [];

for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
  const deps = manifest[section] || {};
  for (const name of Object.keys(deps)) {
    const range = deps[name];
    if (typeof range === "string" && range.startsWith("workspace:")) {
      failures.push(`${section}.${name} is still "${range}" (publisher did not rewrite workspace dep)`);
    }
  }
}

if (!fileList.includes("package/LICENSE.md")) {
  failures.push("LICENSE.md is missing from the tarball");
}

if (failures.length > 0) {
  console.error(`${manifest.name}@${manifest.version}: tarball inspection failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`OK  ${manifest.name}@${manifest.version}`);
