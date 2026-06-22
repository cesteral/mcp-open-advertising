// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { CesteralEntityWriteToolAnnotations } from "./annotations.js";

/**
 * SINGLE-SOURCED cross-repo `cesteralAnnotationSchema` parity vector.
 *
 * The sibling `@cesteral/contract-hash` package pins `definitionHash` parity
 * across the producer (mcp-open-advertising, which generates manifests) and the
 * governance consumer (cesteral-governance-layer, which admits tools) via
 * `CROSS_REPO_DEFINITION_HASH_GOLDEN`. This is the equivalent vector for the
 * OTHER half of the trust seam: the *annotation schema*.
 *
 * The release manifest hard-fails when a tool's `cesteral` block does not
 * satisfy `cesteralAnnotationSchema` (scripts/lib/manifest.mjs), and the
 * governance layer admits tools by parsing the SAME schema
 * (write-preview/admit.ts). "Nothing that fails release can still reach
 * `attested`" therefore holds only while both repos run a `cesteralAnnotationSchema`
 * with identical accept/reject behavior. A one-sided `@cesteral/contract-schema`
 * version bump that changed that behavior would silently break the invariant.
 *
 * This vector turns that into a checkable assertion: the producer self-tests it
 * here, and the consumer imports THIS constant from `@cesteral/contract-schema`
 * and asserts its installed schema reproduces the pinned accept/reject. One
 * source, type-checked, no copy to drift.
 *
 * If the schema legitimately changes its accept/reject behavior, update the
 * fixtures here and re-pin in the SAME change — a single atomic edit, then a
 * coordinated version bump in both repos (guarded by the consumer's
 * contract-schema version-pin test, mirroring contract-hash's F2 pin).
 */
export const CROSS_REPO_ANNOTATION_PARITY_GOLDEN: {
  /** A canonical entity-write annotation the schema MUST accept. */
  accepted: { fixture: CesteralEntityWriteToolAnnotations };
  /**
   * An annotation the schema MUST reject: a `contractId` whose version segment
   * disagrees with `schemaVersion` (the `applyContractIdConsistency` refinement
   * attaches a `contractId`-pathed issue). A contractId-consistency failure is
   * used rather than a missing-`readPartner` failure because the latter collapses
   * to a top-level `invalid_union` with an empty path, whereas the refinement
   * attaches a stable, legible path — so a regression that "rejects, but for the
   * wrong reason" is still caught.
   */
  rejected: { fixture: Record<string, unknown>; expectedIssuePathIncludes: string };
} = {
  accepted: {
    fixture: {
      kind: "write",
      writeClass: "entity",
      platform: "cross_repo",
      contractPlatformSlug: "cross_repo",
      contractToolSlug: "update_entity",
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      entityKinds: ["campaign", "insertion_order", "line_item"],
      entityIdArgs: ["advertiserId", "campaignId"],
      executableArgsExclude: ["dry_run"],
      schemaVersion: 1,
      contractId: "cross_repo.update_entity.v1",
      readPartner: {
        toolName: "cross_repo_get_entity",
        argMap: { entityType: "entityType", advertiserId: "advertiserId" },
      },
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    },
  },
  rejected: {
    fixture: {
      kind: "write",
      writeClass: "entity",
      platform: "cross_repo",
      contractPlatformSlug: "cross_repo",
      contractToolSlug: "update_entity",
      operation: ["update"],
      entityKinds: ["campaign"],
      entityIdArgs: ["advertiserId"],
      executableArgsExclude: ["dry_run"],
      schemaVersion: 1,
      // Version segment (v2) disagrees with schemaVersion (1) — rejected by the
      // applyContractIdConsistency refinement with a `contractId`-pathed issue.
      contractId: "cross_repo.update_entity.v2",
      readPartner: {
        toolName: "cross_repo_get_entity",
        argMap: { entityType: "entityType", advertiserId: "advertiserId" },
      },
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    },
    expectedIssuePathIncludes: "contractId",
  },
};
