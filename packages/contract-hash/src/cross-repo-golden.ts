// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { HashableToolDefinition } from "./index.js";

/**
 * SINGLE-SOURCED cross-repo `definitionHash` vector.
 *
 * This is the one canonical {fixture → expectedDefinitionHash} pair that pins
 * `computeDefinitionHash` parity across the seam between this repo
 * (mcp-open-advertising, which generates manifests) and the governance consumer
 * (cesteral-governance-layer, which verifies them and promotes matching tools to
 * `attested`). Governance promotes a cached tool only when its `definitionHash`
 * matches a hash blessed by a verified upstream manifest, so a silent change to
 * the algorithm on either side would stop every tool reaching `attested`.
 *
 * It used to be a JSON file hand-copied byte-identically into both repos, guarded
 * by a nightly job that fetched the producer copy and compared (issues #94/#360).
 * That two-copy design could drift. Now the vector ships INSIDE this published
 * package: the producer self-tests it here, and the consumer imports THIS constant
 * from `@cesteral/contract-hash` and asserts its installed version reproduces the
 * pinned hash. One source, type-checked, no copy to drift.
 *
 * If the canonicalization legitimately changes, update `fixture` here and
 * recompute `expectedDefinitionHash` in the SAME change — that is now a single,
 * atomic edit instead of a coordinated cross-repo one.
 */
export const CROSS_REPO_DEFINITION_HASH_GOLDEN: {
  expectedDefinitionHash: string;
  fixture: HashableToolDefinition;
} = {
  expectedDefinitionHash: "57de32fb103040f0cb66205c6db3079cc93e939e0ce9824ae7b34990a4edba2a",
  fixture: {
    name: "crossrepo_update_entity",
    description: "Cross-repo golden fixture. Edited in lockstep across both repos.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: { type: "string" },
        budget: { type: "number" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED"] },
      },
      required: ["entityId"],
    },
    outputSchema: {
      type: "object",
      properties: { success: { type: "boolean" }, id: { type: "string" } },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      cesteral: {
        platform: "cross_repo",
        schemaVersion: 1,
        supportsDryRun: true,
        executableArgsExclude: ["dry_run"],
        contractId: "crossrepo.update.v1",
      },
    },
  },
};
