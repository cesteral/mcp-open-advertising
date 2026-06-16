// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Pure logic for the statically-declared governed-package set. Kept import-
// side-effect-free (no boot, no fs at import time) so it is unit-testable.
//
// Each server in registry.json carries an explicit `governed` boolean. This is
// the *intent*: whether the package is expected to ship a signed attestation
// manifest (`dist/cesteral-manifest.json`) because it exposes governed write
// tools. `scripts/generate-manifests.mjs` derives the *actual* governed-ness by
// booting each server and counting tools with an `annotations.cesteral` block.
//
// The inspect-tarball guard (scripts/lib/inspect-tarball.mjs) already catches a
// manifest that was produced but dropped from the tarball. It cannot catch the
// inverse: a `generate:manifests` regression (a dropped annotation, a boot that
// silently returns no governed tools) that fails to *produce* a manifest for a
// package that should have one. Both directions fail OPEN downstream —
// governance treats a missing manifest as benign and silently leaves every tool
// at `observed` trust. `assertManifestCoverage` closes that gap by comparing the
// declared set against what generation actually produced.

/**
 * @typedef {object} RegistryServer
 * @property {string} package
 * @property {boolean} [governed]
 */

/**
 * Returns the set of package names declared `governed: true` in the registry.
 * @param {{ servers: RegistryServer[] }} registry
 * @returns {Set<string>}
 */
export function declaredGovernedPackages(registry) {
  return new Set((registry.servers ?? []).filter((s) => s.governed === true).map((s) => s.package));
}

/**
 * Returns true if the registry declares `pkg` as governed.
 * @param {{ servers: RegistryServer[] }} registry
 * @param {string} pkg  Package dir name, e.g. "dv360-mcp".
 * @returns {boolean}
 */
export function isDeclaredGoverned(registry, pkg) {
  return declaredGovernedPackages(registry).has(pkg);
}

/**
 * Cross-check the declared governed set against what manifest generation
 * actually produced. Catches drift in both directions:
 *   - declared governed but produced 0 entries  → a regression silently
 *     dropped the manifest (fails open downstream).
 *   - declared ungoverned but produced entries  → the registry flag is stale
 *     and should be flipped to `governed: true` so the package is guarded.
 *
 * Also flags any registry server that declares no `governed` field at all —
 * the field is mandatory so a newly-added server can't slip through unclassified.
 *
 * @param {object} opts
 * @param {{ servers: RegistryServer[] }} opts.registry
 * @param {Record<string, number>} opts.entryCounts  package dir → governed entry count produced.
 * @returns {string[]} human-readable failure strings; empty means consistent.
 */
export function assertManifestCoverage({ registry, entryCounts }) {
  const failures = [];

  for (const server of registry.servers ?? []) {
    const pkg = server.package;

    if (typeof server.governed !== "boolean") {
      failures.push(
        `${pkg}: registry.json entry is missing the required boolean "governed" field ` +
          `(set true if it exposes governed write tools, false otherwise)`
      );
      continue;
    }

    // A package not booted during generation has no count — treat as 0 so a
    // declared-governed package skipped entirely still fails loudly.
    const produced = entryCounts[pkg] ?? 0;

    if (server.governed && produced === 0) {
      failures.push(
        `${pkg}: declared "governed": true in registry.json but generate:manifests ` +
          `produced no governed tool entries — a dropped annotation or boot regression ` +
          `would ship no manifest and silently leave its tools at 'observed' trust. ` +
          `Restore the cesteral annotations, or flip the registry flag to false if the ` +
          `package is intentionally no longer governed.`
      );
    }

    if (!server.governed && produced > 0) {
      failures.push(
        `${pkg}: declared "governed": false in registry.json but generate:manifests ` +
          `produced ${produced} governed tool entr${produced === 1 ? "y" : "ies"} — the ` +
          `registry flag is stale. Flip it to "governed": true so the attestation manifest ` +
          `is guarded at publish time.`
      );
    }
  }

  return failures;
}
