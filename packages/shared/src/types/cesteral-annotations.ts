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
 *
 * Discriminated by `kind`:
 * - `"write"` — governed mutation; carries `operation` and a `readPartner`
 *   pointer so consumers can capture pre/post snapshots.
 * - `"read"` — read partner exposed for governance discovery; no operation
 *   or readPartner. Cesteral consumers list these to verify a write tool's
 *   declared `readPartner.toolName` resolves to a real, contract-tagged tool.
 */
export type CesteralToolAnnotations = CesteralWriteToolAnnotations | CesteralReadToolAnnotations;

/** Fields shared by every governed tool, regardless of read/write kind. */
interface CesteralToolAnnotationsBase {
  /** Canonical platform key (e.g. "meta_ads", "dv360", "google_ads"). */
  platform: string;

  /**
   * Entity types this tool can write or read. Reuses the snapshot's
   * `CanonicalEntityKind` so annotations and snapshots stay in lockstep
   * (DV360 InsertionOrder, DBM line items, etc. all annotate without
   * weakening the type).
   */
  entityKinds: CanonicalEntityKind[];

  /** Names of input args that carry platform entity IDs. */
  entityIdArgs: string[];

  /**
   * Bumped on breaking changes to the canonical contract surface. Pinned by
   * consumers so silent contract drift between releases is detectable.
   */
  schemaVersion: number;

  /** Stable cross-release identifier consumers can reference (e.g. "meta.update_entity.v1"). */
  contractId: string;
}

/**
 * Governed write tool. A single tool may dispatch to several canonical
 * operations based on its input args (e.g. Meta `update_entity` covers
 * `update_budget`, `pause`, `resume`, `update_status`); declare the union
 * and let consumers decide the effective operation per-call from the args.
 */
export interface CesteralWriteToolAnnotations extends CesteralToolAnnotationsBase {
  kind: "write";

  /**
   * Canonical operations this tool can perform. The catch-all `"update"` is
   * appropriate for multi-operation dispatchers (e.g. an `update_entity` tool
   * that switches behavior on `data.status` vs `data.daily_budget`).
   */
  operation: Array<"update_budget" | "pause" | "resume" | "update_status" | "create" | "update">;

  /**
   * Read tool that returns the canonical pre/post snapshot for this entity.
   * Required for write tools so the control plane can capture before/after
   * state without maintaining an out-of-band pairing.
   */
  readPartner: {
    toolName: string;
    /** Mapping from this write tool's arg name to the read tool's arg name. */
    argMap: Record<string, string>;
  };

  /** Declares the tool honors the `dry_run` input flag and returns a `DryRunResult`. */
  supportsDryRun?: boolean;

  /** Declares the tool returns canonical `before` / `after` snapshots in its output. */
  supportsBeforeAfterSnapshot?: boolean;
}

/**
 * Read tool exposed for governance. Has no `operation` and no `readPartner`;
 * its purpose is discovery — consumers traverse `write.readPartner.toolName`
 * to find these and confirm they carry a matching contract id.
 */
export interface CesteralReadToolAnnotations extends CesteralToolAnnotationsBase {
  kind: "read";
}
