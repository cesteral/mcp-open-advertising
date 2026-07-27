#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Release guard: the WORKSPACE @cesteral/contract-schema must accept and reject
// the same annotations as the PUBLISHED npm package of the same version.
//
// Why (issue #171, step 3): `scripts/lib/manifest.mjs` validates every released
// tool with the WORKSPACE schema, while the governance repo admits observed
// tools with the PUBLISHED one. CLAUDE.md states these are "the same loose
// schema", and that claim is what makes "nothing that fails release can still
// reach `attested`" true. npm forbids republishing a version, so the two can
// diverge exactly one way: an edit to the workspace schema without a version
// bump. `a5b0f96` did precisely that.
//
// The direction that matters is a published schema LOOSER than the workspace:
// the release gate refuses an annotation the admission gate waves through, so a
// write reaches `attested` carrying promises the release would have refused.
//
// ## The vector set is the entire design
//
// This guard's sibling — check-contract-hash-published-parity.mjs — passed for
// months against the exact drift it existed to catch, because all of its
// fixtures were `__proto__`-free and the fix it needed to see had deliberately
// left `__proto__`-free bytes unchanged. It was, in effect, proving the package
// agreed with itself.
//
// So this guard is built on CROSS_REPO_WRITE_PROMISE_REJECTION_VECTORS:
// annotations the WORKSPACE REJECTS. Verified 2026-07-27 against the real
// registry, published 1.3.0 accepts all five and the workspace rejects all
// five. A vector both builds reject proves nothing — which is why the existing
// CROSS_REPO_ANNOTATION_PARITY_GOLDEN.rejected fixture (a contractId-consistency
// failure, a refinement `a5b0f96` never touched) cannot detect this and is used
// here only as a positive control.
//
// If you add vectors: each must fail the workspace schema for exactly ONE
// reason, and that reason must be a rule you expect to move. A fixture that
// starts failing for an unrelated reason silently degrades this back into the
// agrees-with-itself check.
//
//   - version NOT yet on npm  -> OK. This release publishes it.
//   - version already on npm  -> download and compare; any disagreement fails
//     the release with the instruction to bump.
//   - npm unreachable / any other error -> FAIL (fail closed).
//
// Wired as a release.yml step after Build and before Publish, beside the
// contract-hash guard. Run locally: node scripts/check-contract-schema-published-parity.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

const PKG_NAME = "@cesteral/contract-schema";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Compare two builds of the annotation schema. Pure — takes the already-imported
 * module objects — so the decision logic is unit-testable without npm or the
 * network. Returns human-readable mismatches; empty means the builds agree.
 */
export function compareAnnotationSchemas(workspace, published) {
  const mismatches = [];

  const vectors = workspace.CROSS_REPO_WRITE_PROMISE_REJECTION_VECTORS;
  if (!vectors?.length) {
    return [
      "workspace module exports no CROSS_REPO_WRITE_PROMISE_REJECTION_VECTORS — " +
        "cannot establish parity over the write-promise fields",
    ];
  }

  const parse = (mod, which, fixture, label) => {
    try {
      return mod.parseCesteralAnnotation(fixture);
    } catch (err) {
      mismatches.push(`[${label}] ${which} parseCesteralAnnotation threw: ${err.message}`);
      return undefined;
    }
  };

  for (const vector of vectors) {
    const w = parse(workspace, "workspace", vector.fixture, vector.label);
    const p = parse(published, "published", vector.fixture, vector.label);
    if (w === undefined || p === undefined) continue;

    // The workspace must still reject it, or the vector has stopped being a
    // vector and this guard is quietly measuring nothing.
    if (w.success) {
      mismatches.push(
        `[${vector.label}] workspace ACCEPTS this fixture — it no longer tests ` +
          `${vector.promiseField}; re-pin the vector set`
      );
      continue;
    }

    if (p.success) {
      mismatches.push(
        `[${vector.label}] published build ACCEPTS an annotation the workspace ` +
          `rejects (${vector.promiseField}) — the admission schema is looser than ` +
          `the release schema`
      );
    }
  }

  // Positive control: both builds must agree on the canonical accept/reject
  // pair. This cannot detect write-promise drift (see the header), but it does
  // catch a published build that is broken or wholly different.
  const golden = workspace.CROSS_REPO_ANNOTATION_PARITY_GOLDEN;
  if (golden) {
    const acc = parse(published, "published", golden.accepted.fixture, "golden accepted");
    if (acc !== undefined && !acc.success) {
      mismatches.push("published build REJECTS the canonical accepted annotation");
    }
    const rej = parse(published, "published", golden.rejected.fixture, "golden rejected");
    if (rej !== undefined && rej.success) {
      mismatches.push("published build ACCEPTS the canonical rejected annotation");
    }
  }

  return mismatches;
}

/** `npm view <pkg>@<version> dist.tarball`. null when unpublished; throws otherwise. */
function publishedTarballUrl(version) {
  const res = spawnSync("npm", ["view", `${PKG_NAME}@${version}`, "dist.tarball"], {
    encoding: "utf8",
  });
  if (res.status === 0) {
    const url = res.stdout.trim();
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

  // zod is a peerDependency, so the extracted tarball cannot resolve it on its
  // own. Link the workspace's copy in — the same major the package declares, and
  // the same one the workspace build is being compared against.
  const pkgDir = join(destDir, "package");
  const zodDir = dirname(require.resolve("zod/package.json", { paths: [ROOT] }));
  mkdirSync(join(pkgDir, "node_modules"), { recursive: true });
  symlinkSync(zodDir, join(pkgDir, "node_modules", "zod"), "dir");

  return join(pkgDir, "dist", "index.js");
}

async function main() {
  const { version } = require(join(ROOT, "packages/contract-schema/package.json"));

  const url = publishedTarballUrl(version);
  if (url === null) {
    console.log(
      `${PKG_NAME}@${version} is not yet published — this release will publish it. ` +
        "Parity guard passes (governance pins the new version in lockstep)."
    );
    return;
  }

  const workspace = await import(
    pathToFileURL(join(ROOT, "packages/contract-schema/dist/index.js")).href
  );

  const dest = mkdtempSync(join(tmpdir(), "contract-schema-parity-"));
  let mismatches;
  try {
    const publishedEntry = await downloadAndExtract(url, dest);
    const published = await import(pathToFileURL(publishedEntry).href);
    mismatches = compareAnnotationSchemas(workspace, published);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }

  if (mismatches.length > 0) {
    console.error(
      `\n${PKG_NAME}@${version} PARITY FAILURE: the workspace annotation schema ` +
        `disagrees with the already-published ${version} tarball. The release gate ` +
        "and the governance admission gate are documented as the same schema; while " +
        "these differ, that is false, and an annotation the release refuses can still " +
        "reach `attested`.\n\n" +
        mismatches.map((m) => `  - ${m}`).join("\n") +
        "\n\nFix: bump packages/contract-schema version (and coordinate the governance " +
        "repo's pin) instead of editing the schema in place.\n"
    );
    process.exit(1);
  }

  console.log(
    `${PKG_NAME}@${version}: workspace annotation schema matches the published tarball ` +
      "(all write-promise rejection vectors and the golden pair agree)."
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
}
