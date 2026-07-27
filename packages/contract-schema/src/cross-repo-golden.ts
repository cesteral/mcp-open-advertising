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

/**
 * Write-promise rejection vectors — the fixtures that can detect the `a5b0f96`
 * drift, which {@link CROSS_REPO_ANNOTATION_PARITY_GOLDEN} structurally cannot.
 *
 * Why a second set (2026-07-27, issue #171): that golden's `rejected` fixture
 * fails on `applyContractIdConsistency`, a refinement `a5b0f96` did not touch.
 * The published `1.3.0` rejects it too, so comparing the two builds over that
 * vector reports agreement no matter how far the write-promise fields have
 * drifted. This is the same shape of blind spot the sibling package hit: its
 * `definitionHash` goldens were all `__proto__`-free, so they could not see the
 * one canonicalization change that ever happened.
 *
 * These fixtures are therefore chosen for exactly the property the golden lacks
 * — **the workspace schema rejects each one, and the pre-`a5b0f96` published
 * schema accepts it**. A parity guard built on them fails when the published
 * schema is LOOSER than the workspace, which is the direction that actually
 * matters here: the release gate and the admission gate are documented as the
 * same schema, and a looser admission side means a write can reach `attested`
 * carrying promises the release would have refused.
 *
 * Each fixture is otherwise a valid annotation; only the promise fields differ.
 * If a fixture ever fails for an unrelated reason, this guard degrades to the
 * useless "agrees with itself" check it was written to replace — so keep them
 * minimal and keep the reason for rejection single.
 */
export const CROSS_REPO_WRITE_PROMISE_REJECTION_VECTORS: readonly {
  label: string;
  /** The field whose absence or wrong value is the sole reason for rejection. */
  promiseField: string;
  fixture: Record<string, unknown>;
}[] = [
  {
    label: "entity write omitting requiresValidation",
    promiseField: "requiresValidation",
    fixture: {
      kind: "write",
      writeClass: "entity",
      platform: "cross_repo",
      contractPlatformSlug: "cross_repo",
      contractToolSlug: "update_entity",
      operation: ["update"],
      entityKinds: ["campaign"],
      entityIdArgs: ["advertiserId"],
      schemaVersion: 1,
      contractId: "cross_repo.update_entity.v1",
      readPartner: {
        toolName: "cross_repo_get_entity",
        argMap: { advertiserId: "advertiserId" },
      },
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresSimulation: true,
    },
  },
  {
    label: "entity write omitting requiresSimulation",
    promiseField: "requiresSimulation",
    fixture: {
      kind: "write",
      writeClass: "entity",
      platform: "cross_repo",
      contractPlatformSlug: "cross_repo",
      contractToolSlug: "update_entity",
      operation: ["update"],
      entityKinds: ["campaign"],
      entityIdArgs: ["advertiserId"],
      schemaVersion: 1,
      contractId: "cross_repo.update_entity.v1",
      readPartner: {
        toolName: "cross_repo_get_entity",
        argMap: { advertiserId: "advertiserId" },
      },
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
    },
  },
  {
    label: "entity write omitting supportsDryRun",
    promiseField: "supportsDryRun",
    fixture: {
      kind: "write",
      writeClass: "entity",
      platform: "cross_repo",
      contractPlatformSlug: "cross_repo",
      contractToolSlug: "update_entity",
      operation: ["update"],
      entityKinds: ["campaign"],
      entityIdArgs: ["advertiserId"],
      schemaVersion: 1,
      contractId: "cross_repo.update_entity.v1",
      readPartner: {
        toolName: "cross_repo_get_entity",
        argMap: { advertiserId: "advertiserId" },
      },
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: true,
    },
  },
  {
    label: "entity write disabling supportsBeforeAfterSnapshot",
    promiseField: "supportsBeforeAfterSnapshot",
    fixture: {
      kind: "write",
      writeClass: "entity",
      platform: "cross_repo",
      contractPlatformSlug: "cross_repo",
      contractToolSlug: "update_entity",
      operation: ["update"],
      entityKinds: ["campaign"],
      entityIdArgs: ["advertiserId"],
      schemaVersion: 1,
      contractId: "cross_repo.update_entity.v1",
      readPartner: {
        toolName: "cross_repo_get_entity",
        argMap: { advertiserId: "advertiserId" },
      },
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    },
  },
  {
    label: "effect write claiming a before/after snapshot it cannot produce",
    promiseField: "supportsBeforeAfterSnapshot",
    fixture: {
      kind: "write",
      writeClass: "effect",
      platform: "cross_repo",
      contractPlatformSlug: "cross_repo",
      contractToolSlug: "upload_conversions",
      operation: ["update"],
      entityKinds: ["campaign"],
      entityIdArgs: ["advertiserId"],
      schemaVersion: 1,
      contractId: "cross_repo.upload_conversions.v1",
      supportsBeforeAfterSnapshot: true,
      requiresValidation: true,
      requiresSimulation: false,
    },
  },
];
