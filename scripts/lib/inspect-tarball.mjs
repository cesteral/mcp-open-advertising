// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Pure inspection logic for a packed .tgz tarball. Kept import-side-effect-free
// (the CLI wrapper lives in scripts/inspect-tarball.mjs) so it is unit-testable
// without packing a real tarball.
//
// Checks performed:
//   1. Unresolved `workspace:` dependency ranges in the manifest. `pnpm pack`
//      should have rewritten these; their presence means the wrong publisher
//      was used and the tarball would break npm consumers.
//   2. LICENSE.md missing from the tarball file list, despite the manifest's
//      `files` array claiming it ships.
//   3. (only when `expectManifest`) the attestation manifest
//      `dist/cesteral-manifest.json` missing from the tarball file list. The
//      caller sets this for governed packages — those whose build produced a
//      manifest on disk. A dropped manifest fails OPEN downstream (governance
//      treats a missing manifest as benign and silently leaves every tool at
//      `observed` trust), so a `files`/`.npmignore` regression that excludes it
//      would never surface as an error. This gate makes it loud at publish time,
//      mirroring the LICENSE.md check.

const DEP_SECTIONS = ["dependencies", "peerDependencies", "optionalDependencies"];

/** Path of the attestation manifest inside the tarball's `package/` root. */
export const TARBALL_MANIFEST_PATH = "package/dist/cesteral-manifest.json";

/** Path of the license inside the tarball's `package/` root. */
export const TARBALL_LICENSE_PATH = "package/LICENSE.md";

/**
 * Inspect a tarball's parsed package.json (`manifest`) and its list of member
 * paths (`fileList`, e.g. "package/dist/index.js"). Returns an array of
 * human-readable failure strings; empty means the tarball passed.
 *
 * @param {object} opts
 * @param {Record<string, unknown>} opts.manifest  Parsed package/package.json.
 * @param {string[]} opts.fileList                 Tarball member paths.
 * @param {boolean} [opts.expectManifest=false]    Require the attestation manifest to ship.
 * @returns {string[]} failures
 */
export function inspectTarball({ manifest, fileList, expectManifest = false }) {
  const failures = [];

  for (const section of DEP_SECTIONS) {
    const deps = manifest[section] || {};
    for (const name of Object.keys(deps)) {
      const range = deps[name];
      if (typeof range === "string" && range.startsWith("workspace:")) {
        failures.push(
          `${section}.${name} is still "${range}" (publisher did not rewrite workspace dep)`
        );
      }
    }
  }

  if (!fileList.includes(TARBALL_LICENSE_PATH)) {
    failures.push("LICENSE.md is missing from the tarball");
  }

  if (expectManifest && !fileList.includes(TARBALL_MANIFEST_PATH)) {
    failures.push(
      `${TARBALL_MANIFEST_PATH} is missing from the tarball even though this ` +
        `governed package built one — a dropped attestation manifest fails open ` +
        `(tools silently stay at 'observed' trust). Check the package's "files"/.npmignore.`
    );
  }

  return failures;
}
