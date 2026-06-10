#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// CLI wrapper around scripts/lib/inspect-tarball.mjs. Extracts a packed .tgz
// tarball's package.json + member list and runs the pure inspection checks.
//
// Usage: node scripts/inspect-tarball.mjs <path-to-tarball.tgz> [--expect-manifest]
//   --expect-manifest  Also require dist/cesteral-manifest.json to be present.
//                      Set by publish-all.sh for governed packages (those whose
//                      build produced an attestation manifest on disk).
// Exits 0 on success, 1 on any failure with a human-readable message on stderr.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { inspectTarball } from "./lib/inspect-tarball.mjs";

const args = process.argv.slice(2);
const expectManifest = args.includes("--expect-manifest");
const tarball = args.find((a) => !a.startsWith("--"));

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

const failures = inspectTarball({ manifest, fileList, expectManifest });

if (failures.length > 0) {
  console.error(`${manifest.name}@${manifest.version}: tarball inspection failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`OK  ${manifest.name}@${manifest.version}`);
