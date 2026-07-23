#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Release guard: the WORKSPACE @cesteral/contract-hash must canonicalize
// bit-identically to the PUBLISHED npm package of the same version.
//
// Why (attestation review 2026-07-23, F7): `generate-manifests.mjs` hashes
// every governed tool with the WORKSPACE contract-hash source, while the
// downstream governance repo exact-pins the PUBLISHED package (currently via
// its `contract-hash-version-pin.test.ts`). npm forbids republishing a
// version, so the only way those two can drift is an edit to the workspace
// source (canonicalization + goldens updated together, so all in-repo tests
// stay green) WITHOUT a version bump. The next tag release would then ship
// manifests hashed with the new algorithm while governance still computes
// hashes with the published old one — every tool silently stops reaching
// `attested` (mass availability failure at the trust-promotion seam).
//
// This script closes that seam at release time:
//   - version NOT yet on npm  -> OK. This release publishes it; governance
//     bumps its pin to the new version in lockstep (its pin test enforces
//     the coordinated upgrade).
//   - version already on npm  -> download the published tarball and require
//     its computeDefinitionHash to reproduce the workspace's golden vectors
//     (and vice versa). Any disagreement means the workspace changed the
//     canonicalization under an already-published version: FAIL the release
//     with the instruction to bump the package version.
//   - npm unreachable / any other error -> FAIL (fail closed; the release
//     environment must be able to reach the registry anyway to publish).
//
// Wired as a release.yml step after Build (needs packages/contract-hash/dist)
// and before Publish. Run locally: node scripts/check-contract-hash-published-parity.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

const PKG_NAME = "@cesteral/contract-hash";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Compare two builds of the canonicalizer over the workspace's exported golden
 * surface. Pure — takes the already-imported module objects — so the decision
 * logic is unit-testable without npm or the network. Returns a list of
 * human-readable mismatches; empty means the two builds agree.
 */
export function compareCanonicalizers(workspace, published) {
  const mismatches = [];

  const vectors = [
    { label: "single cross-repo golden", ...workspace.CROSS_REPO_DEFINITION_HASH_GOLDEN },
    ...(workspace.CROSS_REPO_DEFINITION_HASH_GOLDEN_VECTORS ?? []),
  ];
  if (vectors.length <= 1 && !workspace.CROSS_REPO_DEFINITION_HASH_GOLDEN) {
    mismatches.push("workspace module exports no golden vectors — cannot establish parity");
    return mismatches;
  }

  for (const vector of vectors) {
    const expected = vector.expectedDefinitionHash;
    let workspaceHash;
    let publishedHash;
    try {
      workspaceHash = workspace.computeDefinitionHash(vector.fixture);
    } catch (err) {
      mismatches.push(`[${vector.label}] workspace computeDefinitionHash threw: ${err.message}`);
      continue;
    }
    try {
      publishedHash = published.computeDefinitionHash(vector.fixture);
    } catch (err) {
      mismatches.push(`[${vector.label}] published computeDefinitionHash threw: ${err.message}`);
      continue;
    }
    if (workspaceHash !== expected) {
      mismatches.push(
        `[${vector.label}] workspace hash ${workspaceHash} != pinned golden ${expected}`
      );
    }
    if (publishedHash !== workspaceHash) {
      mismatches.push(
        `[${vector.label}] published hash ${publishedHash} != workspace hash ${workspaceHash}`
      );
    }
  }

  // The published package's own pinned golden must agree too — a lockstep edit
  // that moved the workspace golden forward is exactly the drift this guards.
  const publishedGolden = published.CROSS_REPO_DEFINITION_HASH_GOLDEN;
  const workspaceGolden = workspace.CROSS_REPO_DEFINITION_HASH_GOLDEN;
  if (
    publishedGolden?.expectedDefinitionHash !== workspaceGolden?.expectedDefinitionHash
  ) {
    mismatches.push(
      `published CROSS_REPO_DEFINITION_HASH_GOLDEN (${publishedGolden?.expectedDefinitionHash}) ` +
        `!= workspace golden (${workspaceGolden?.expectedDefinitionHash})`
    );
  }

  return mismatches;
}

/**
 * `npm view <pkg>@<version> dist.tarball`. Returns the tarball URL, or null
 * when the version is not published (E404). Throws on any other failure so
 * network problems fail the release instead of silently skipping the guard.
 */
function publishedTarballUrl(version) {
  const res = spawnSync("npm", ["view", `${PKG_NAME}@${version}`, "dist.tarball"], {
    encoding: "utf8",
  });
  if (res.status === 0) {
    const url = res.stdout.trim();
    // npm view of an existing package but nonexistent version can also exit 0
    // with empty output on some npm majors — treat empty as not-published.
    return url.length > 0 ? url : null;
  }
  const stderr = `${res.stderr ?? ""}`;
  if (stderr.includes("E404") || stderr.includes("404 Not Found")) return null;
  throw new Error(`npm view failed (not a 404 — refusing to skip the parity guard): ${stderr}`);
}

async function downloadAndExtract(url, destDir) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`tarball fetch ${url} -> ${resp.status} ${resp.statusText}`);
  const tarballPath = join(destDir, "package.tgz");
  writeFileSync(tarballPath, Buffer.from(await resp.arrayBuffer()));
  const tar = spawnSync("tar", ["-xzf", tarballPath, "-C", destDir], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(`tar extract failed: ${tar.stderr}`);
  // npm tarballs unpack under `package/`.
  return join(destDir, "package", "dist", "index.js");
}

async function main() {
  const { version } = require(join(ROOT, "packages/contract-hash/package.json"));

  const url = publishedTarballUrl(version);
  if (url === null) {
    console.log(
      `${PKG_NAME}@${version} is not yet published — this release will publish it. ` +
        "Parity guard passes (governance pins the new version in lockstep)."
    );
    return;
  }

  const workspace = await import(
    pathToFileURL(join(ROOT, "packages/contract-hash/dist/index.js")).href
  );

  const dest = mkdtempSync(join(tmpdir(), "contract-hash-parity-"));
  let mismatches;
  try {
    const publishedEntry = await downloadAndExtract(url, dest);
    const published = await import(pathToFileURL(publishedEntry).href);
    mismatches = compareCanonicalizers(workspace, published);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }

  if (mismatches.length > 0) {
    console.error(
      `\n${PKG_NAME}@${version} PARITY FAILURE: the workspace canonicalizer disagrees with the ` +
        `already-published ${version} tarball. Publishing manifests hashed with a changed ` +
        "algorithm under an unchanged version would silently de-attest the fleet downstream " +
        "(governance exact-pins the published package).\n\n" +
        mismatches.map((m) => `  - ${m}`).join("\n") +
        "\n\nFix: bump packages/contract-hash version (and coordinate the governance repo's " +
        "contract-hash pin) instead of editing the canonicalization in place.\n"
    );
    process.exit(1);
  }
  console.log(
    `${PKG_NAME}@${version}: workspace canonicalizer matches the published tarball ` +
      "(all golden vectors agree)."
  );
}

// Run only when invoked directly so tests can import compareCanonicalizers
// without triggering the npm/network path.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
}
