// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { CanonicalEntityKind } from "./normalized-entity-snapshot.js";

/**
 * `cesteral.*` annotation namespace declared on governed write/read tools.
 *
 * Lives inside the standard MCP `annotations` object. Non-Cesteral clients
 * ignore namespaces they do not understand; Cesteral consumers read this
 * block to admit, govern, and reconcile external write operations without
 * maintaining an out-of-band registry. See
 * `docs/plans/2026-05-13-mcp-server-write-contract-declaration.md` in
 * `cesteral-intelligence` for the full design.
 */
export interface CesteralToolAnnotations {
  /** Canonical platform key (e.g. "meta_ads", "dv360", "google_ads"). */
  platform: string;

  /** Canonical operation key. */
  operation: "update_budget" | "pause" | "resume" | "update_status" | "create" | "update";

  /**
   * Entity types this tool can write or read. Reuses the snapshot's
   * `CanonicalEntityKind` so annotations and snapshots stay in lockstep
   * (DV360 InsertionOrder, DBM line items, etc. all annotate without
   * weakening the type).
   */
  entityKinds: CanonicalEntityKind[];

  /** Names of input args that carry platform entity IDs (used to build read-partner calls). */
  entityIdArgs: string[];

  /**
   * Read tool that returns the canonical pre/post snapshot for this entity.
   * Required for write tools; omitted on read tools.
   */
  readPartner?: {
    toolName: string;
    /** Mapping from this tool's arg name to the read tool's arg name. */
    argMap: Record<string, string>;
  };

  /**
   * Bumped on breaking changes to the canonical contract surface. Pinned by
   * consumers so silent contract drift between releases is detectable.
   */
  schemaVersion: number;

  /** Stable cross-release identifier consumers can reference (e.g. "meta.campaign.update_budget.v1"). */
  contractId: string;

  /** Declares the tool honors the `dry_run` input flag and returns a `DryRunResult`. */
  supportsDryRun?: boolean;

  /** Declares the tool returns canonical `before` / `after` snapshots in its output. */
  supportsBeforeAfterSnapshot?: boolean;
}
