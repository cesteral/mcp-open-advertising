// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isHashAlg, type HashAlg } from "@cesteral/contract-hash";

/**
 * What the decision-token verifier needs from a tool's manifest entry: the
 * precomputed `definitionHash`, and the canonicalization it was computed under.
 * `hashAlg` is absent when the entry carries none, which means `cesteral-c14n-v1`
 * (every manifest published before the field existed) — the resolver does not
 * invent a value, so "legacy by omission" stays distinguishable from "stated".
 */
export interface ManifestEntryRef {
  definitionHash: string;
  hashAlg?: HashAlg;
}

/**
 * Load the published per-package attestation manifest and index its tools by
 * name → {@link ManifestEntryRef}. The manifest (`dist/cesteral-manifest.json`,
 * produced by `scripts/generate-manifests.mjs`) is the SAME artifact governance
 * reads when minting decision tokens, so resolving the expected `definitionHash`
 * from it guarantees byte-parity with the token claim.
 *
 * An entry whose `hashAlg` is present but not a name this build knows is LEFT OUT:
 * its hash was computed under a canonicalization we cannot reproduce, so comparing
 * against it would be meaningless. Left unresolved it fails closed under `enforce`
 * and reports `definitionHashVerified: false` under `warn`, like a missing entry.
 *
 * Graceful by design: a missing or unreadable/malformed manifest yields an empty
 * map (the decision-token verifier then reports `definitionHashVerified: false`
 * under `warn`, and fails closed under `enforce`) rather than throwing at boot.
 */
export function loadManifestEntries(manifestPath: string | URL): Map<string, ManifestEntryRef> {
  const path = manifestPath instanceof URL ? fileURLToPath(manifestPath) : manifestPath;
  const map = new Map<string, ManifestEntryRef>();
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as {
      tools?: Array<{ toolName?: unknown; definitionHash?: unknown; hashAlg?: unknown }>;
    };
    for (const tool of parsed.tools ?? []) {
      if (typeof tool.toolName !== "string" || typeof tool.definitionHash !== "string") continue;
      if (tool.hashAlg === undefined) {
        map.set(tool.toolName, { definitionHash: tool.definitionHash });
      } else if (isHashAlg(tool.hashAlg)) {
        map.set(tool.toolName, { definitionHash: tool.definitionHash, hashAlg: tool.hashAlg });
      }
    }
  } catch {
    // Missing / unreadable / malformed → empty map (graceful boot).
  }
  return map;
}

/**
 * Build a `resolveManifestEntry(toolName)` function backed by a package's
 * attestation manifest. Pass the result to `registerToolsFromDefinitions` so the
 * decision-token verifier can bind the token's `definitionHash` claim to the
 * tool's attested hash, and require the token's `hashAlg` to match the entry's.
 */
const resolverCache = new Map<string, Map<string, ManifestEntryRef>>();

export function createManifestEntryResolver(
  manifestPath: string | URL
): (toolName: string) => ManifestEntryRef | undefined {
  const key = manifestPath instanceof URL ? fileURLToPath(manifestPath) : manifestPath;
  // Cache by resolved path so per-session server creation does not re-read the
  // manifest file on every connection. The manifest is immutable for a running
  // process (baked into the build artifact).
  let map = resolverCache.get(key);
  if (!map) {
    map = loadManifestEntries(key);
    resolverCache.set(key, map);
  }
  return (toolName: string) => map.get(toolName);
}
