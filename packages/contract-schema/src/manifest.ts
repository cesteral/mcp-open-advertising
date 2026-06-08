// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Schema for `dist/cesteral-manifest.json`, the per-release attestation
 * manifest that ships inside each `@cesteral/<platform>-mcp` package tarball.
 * Verifying npm provenance on the package transitively verifies this file (it
 * lives inside the signed tarball — no separate signature).
 *
 * Two sides parse this exact shape and MUST agree: the release manifest
 * generator (`scripts/generate-manifests.mjs`) writes it, and the governance
 * cache-refresh reconciler treats a successfully verified manifest as a set of
 * "blessed" tool-definition hashes — any observed `definitionHash` matching an
 * entry here is promoted to `definitionTrust = 'attested'`.
 *
 * `definitionHash` is bare lowercase hex (no `sha256:` prefix), matching
 * `@cesteral/contract-hash`'s `computeDefinitionHash()` output — keeping the
 * surfaces bit-identical avoids any normalization layer between the repos.
 */
export const cesteralManifestSchema = z.object({
  manifestVersion: z.literal(1),
  packageName: z.string().regex(/^@cesteral\/[a-z0-9-]+-mcp$/),
  packageVersion: z.string(),
  generatedAt: z.string().datetime(),
  tools: z
    .array(
      z.object({
        toolName: z.string(),
        contractPlatformSlug: z.string(),
        contractToolSlug: z.string(),
        schemaVersion: z.string(),
        definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
      })
    )
    .min(1),
});

export type CesteralManifest = z.infer<typeof cesteralManifestSchema>;
export type CesteralManifestTool = CesteralManifest["tools"][number];
