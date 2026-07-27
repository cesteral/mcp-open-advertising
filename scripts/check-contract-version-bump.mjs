#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// PR guard: a change to a contract library's `src/` must come with a version
// bump in the same change.
//
// Why (issues #165, #171): both `@cesteral/contract-hash` and
// `@cesteral/contract-schema` have been edited in place after publication —
// `640c33c` changed the canonicalizer and `a5b0f96` tightened the annotation
// schema, and neither touched a `package.json`. npm versions are immutable, so
// the published package the governance repo exact-pins could not contain
// either change. The result is two builds of one version number with different
// behaviour: for contract-hash, a `definitionHash` collision fix that never
// reached the side that does trust promotion; for contract-schema, an
// admission schema looser than the release schema it is documented to equal.
//
// This has now happened at least four times (#94, #97, #103, #165/#171), which
// is the argument for a mechanical check rather than more review attention.
//
// Where this sits relative to the other two guards:
//
//   - `check-contract-hash-published-parity.mjs` runs at RELEASE time and
//     compares the built canonicalizer to the published tarball. It catches the
//     same class, but only once someone cuts a tag — by which point the
//     offending commit is long merged. It also only covers contract-hash.
//   - `publish-all.sh` treats "cannot publish over the previously published
//     version" as benign and continues, so an unbumped source change looks like
//     a SUCCESSFUL release. That is deliberate (a fleet tag republishes every
//     package, and most have nothing new), but it means the release path will
//     never be the thing that tells you.
//
// So this check is the only one positioned to fail on the PR that causes the
// drift. It is intentionally dumb: it does not know what a canonicalization is,
// only that these two packages' source and version move together.
//
// Usage: node scripts/check-contract-version-bump.mjs [--base <ref>]
//   --base defaults to $GITHUB_BASE_REF (set on pull_request), else origin/main.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** The packages this rule covers. Both are published, both are exact-pinned downstream. */
export const CONTRACT_PACKAGES = ["contract-hash", "contract-schema"];

/**
 * Decide which packages violate the rule. Pure — takes already-resolved facts —
 * so the decision logic is unit-testable without a git repository or npm.
 *
 * @param {Array<{name: string, srcChanged: boolean, baseVersion: string|null,
 *   headVersion: string|null, headVersionPublished: boolean}>} packages
 * @returns {Array<{name: string, reason: string}>}
 */
export function evaluateContractVersionBump(packages) {
  const violations = [];

  for (const pkg of packages) {
    if (!pkg.srcChanged) continue;

    // A package added in this change has no base version to compare against;
    // its first publish establishes the version, so there is nothing to bump.
    if (pkg.baseVersion === null) continue;

    if (pkg.headVersion === null) {
      violations.push({
        name: pkg.name,
        reason: "src/ changed but package.json has no version field at HEAD",
      });
      continue;
    }

    if (pkg.headVersion !== pkg.baseVersion) continue;

    // The rule is about IMMUTABILITY, not about bumping for its own sake. If
    // the current version is not on npm yet, there is no published artifact
    // this edit can diverge from — the pending release will publish whatever
    // the source finally says. Both parity guards make the same carve-out.
    //
    // Without this, the guard fires on every follow-up commit to an
    // already-bumped-but-unreleased version and demands a second, meaningless
    // bump. It did exactly that on the PR that introduced it (#174).
    if (!pkg.headVersionPublished) continue;

    violations.push({
      name: pkg.name,
      reason: `src/ changed but version is still ${pkg.baseVersion}, which is already published`,
    });
  }

  return violations;
}

function git(args) {
  const res = spawnSync("git", args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${res.stderr?.trim()}`);
  }
  return res.stdout;
}

/** `git show <ref>:<path>` → parsed JSON, or null when the file does not exist there. */
function readJsonAtRef(ref, path) {
  const res = spawnSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

/**
 * Is `<pkg>@<version>` already on npm? Throws on any non-404 failure so a
 * registry outage fails the check rather than silently waving an edit through
 * — same fail-closed posture as the two parity guards.
 */
function isPublished(pkgName, version) {
  const res = spawnSync("npm", ["view", `${pkgName}@${version}`, "version"], {
    encoding: "utf8",
  });
  if (res.status === 0) return res.stdout.trim().length > 0;
  const stderr = `${res.stderr ?? ""}`;
  if (stderr.includes("E404") || stderr.includes("404 Not Found")) return false;
  throw new Error(
    `npm view ${pkgName}@${version} failed (not a 404 — refusing to skip the check): ${stderr}`
  );
}

function resolveBaseRef() {
  const explicit = process.argv.indexOf("--base");
  if (explicit !== -1 && process.argv[explicit + 1]) return process.argv[explicit + 1];
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return "origin/main";
}

function main() {
  const baseRef = resolveBaseRef();

  // Compare against the merge base, not the branch tip: a branch that is merely
  // behind main must not be reported as having reverted someone else's bump.
  const mergeBase = git(["merge-base", baseRef, "HEAD"]).trim();

  const packages = CONTRACT_PACKAGES.map((name) => {
    const dir = `packages/${name}`;
    const changed = git([
      "diff",
      "--name-only",
      `${mergeBase}..HEAD`,
      "--",
      `${dir}/src`,
    ]).trim();

    const basePkg = readJsonAtRef(mergeBase, `${dir}/package.json`);
    const headPkg = readJsonAtRef("HEAD", `${dir}/package.json`);

    const srcChanged = changed.length > 0;
    const headVersion = headPkg?.version ?? null;

    return {
      name,
      srcChanged,
      baseVersion: basePkg?.version ?? null,
      headVersion,
      // Only ask npm when the answer can change the outcome — keeps the job
      // network-free on the overwhelmingly common no-contract-change PR.
      headVersionPublished:
        srcChanged && headVersion !== null
          ? isPublished(`@cesteral/${name}`, headVersion)
          : false,
      changedFiles: changed ? changed.split("\n") : [],
    };
  });

  const violations = evaluateContractVersionBump(packages);

  if (violations.length > 0) {
    console.error(
      "\ncheck:contract-version-bump FAILED — a contract library's source changed\n" +
        "without a version bump. npm versions are immutable, so this produces two\n" +
        "builds of one version number: the published package that the governance\n" +
        "repo exact-pins can never contain this change.\n"
    );
    for (const v of violations) {
      const pkg = packages.find((p) => p.name === v.name);
      console.error(`  ✗ @cesteral/${v.name}: ${v.reason}`);
      for (const f of pkg.changedFiles) console.error(`      ${f}`);
    }
    console.error(
      "\nFix: bump the version in packages/<name>/package.json in this same change.\n" +
        "Choose major when the change alters behaviour for input that previously\n" +
        "succeeded (a different hash, a newly-rejected annotation) — these are\n" +
        "public packages, and a consumer on ^1.x must not float onto that.\n" +
        "Then coordinate the governance repo's pin once the new version is on npm.\n"
    );
    process.exit(1);
  }

  const touched = packages.filter((p) => p.srcChanged);
  if (touched.length === 0) {
    console.log("check:contract-version-bump: no contract-library source changes.");
  } else {
    for (const p of touched) {
      const detail =
        p.headVersion === p.baseVersion
          ? `${p.headVersion} (not yet published — nothing to diverge from)`
          : `${p.baseVersion} → ${p.headVersion}`;
      console.log(`check:contract-version-bump: @cesteral/${p.name} ${detail} ✓`);
    }
  }
}

// Run only when invoked directly so tests can import the pure core without
// touching git.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  }
}
