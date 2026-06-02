// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Load the published per-package attestation manifest and index its tools by
 * name → `definitionHash`. The manifest (`dist/cesteral-manifest.json`,
 * produced by `scripts/generate-manifests.mjs`) is the SAME artifact governance
 * reads when minting decision tokens, so resolving the expected `definitionHash`
 * from it guarantees byte-parity with the token claim.
 *
 * Graceful by design: a missing or unreadable/malformed manifest yields an empty
 * map (the decision-token verifier then reports `definitionHashVerified: false`
 * under `warn`, and fails closed under `enforce`) rather than throwing at boot.
 */
export function loadManifestDefinitionHashes(manifestPath: string | URL): Map<string, string> {
  const path = manifestPath instanceof URL ? fileURLToPath(manifestPath) : manifestPath;
  const map = new Map<string, string>();
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as {
      tools?: Array<{ toolName?: unknown; definitionHash?: unknown }>;
    };
    for (const tool of parsed.tools ?? []) {
      if (typeof tool.toolName === "string" && typeof tool.definitionHash === "string") {
        map.set(tool.toolName, tool.definitionHash);
      }
    }
  } catch {
    // Missing / unreadable / malformed → empty map (graceful boot).
  }
  return map;
}

/**
 * Build a `resolveDefinitionHash(toolName)` function backed by a package's
 * attestation manifest. Pass the result to `registerToolsFromDefinitions` so the
 * decision-token verifier can bind the token's `definitionHash` claim to the
 * tool's attested hash.
 */
const resolverCache = new Map<string, Map<string, string>>();

export function createDefinitionHashResolver(
  manifestPath: string | URL
): (toolName: string) => string | undefined {
  const key = manifestPath instanceof URL ? fileURLToPath(manifestPath) : manifestPath;
  // Cache by resolved path so per-session server creation does not re-read the
  // manifest file on every connection. The manifest is immutable for a running
  // process (baked into the build artifact).
  let map = resolverCache.get(key);
  if (!map) {
    map = loadManifestDefinitionHashes(key);
    resolverCache.set(key, map);
  }
  return (toolName: string) => map.get(toolName);
}
