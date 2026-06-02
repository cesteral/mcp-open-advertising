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
   * Platform component of `contractId`. A slug matching `/^[a-z0-9_]{1,40}$/`
   * — lowercase, digits, underscores; no hyphens. May differ from `platform`
   * (e.g. platform "meta_ads" pairs with the slug "meta"). The governance
   * admission layer parses the annotation against this exact slug shape.
   */
  contractPlatformSlug: string;

  /**
   * Tool component of `contractId`. Same slug shape as `contractPlatformSlug`.
   */
  contractToolSlug: string;

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

  /**
   * Stable cross-release identifier. MUST equal
   * `${contractPlatformSlug}.${contractToolSlug}.v${schemaVersion}` — the
   * governance admission layer rejects any divergence.
   */
  contractId: string;
}

/**
 * Canonical write operations. Multi-operation dispatchers (e.g. an
 * `update_entity` tool that switches on `data.status` vs `data.daily_budget`)
 * declare the union and let consumers decide the effective operation per call.
 * Entity-class ops describe canonical mutations; effect-class ops describe
 * writes with no canonical entity snapshot (uploads, report schedules, etc.).
 */
export type CesteralWriteOperation =
  // entity-class
  | "update_budget"
  | "pause"
  | "resume"
  | "update_status"
  | "update_schedule"
  | "create"
  | "update"
  | "delete"
  | "duplicate"
  | "archive"
  | "bulk_update_status"
  | "adjust_bids"
  // effect-class
  | "upload"
  | "create_schedule"
  | "delete_schedule"
  | "submit_report"
  | "upload_conversions"
  | "bulk_job"
  | "manage";

/** Fields shared by every governed write tool, regardless of `writeClass`. */
interface CesteralWriteToolAnnotationsBase extends CesteralToolAnnotationsBase {
  kind: "write";

  /**
   * Discriminates the contract surface:
   * - `"entity"` — mutates a canonical entity; carries a `readPartner` and
   *   returns before/after `NormalizedEntitySnapshot`s.
   * - `"effect"` — a write with no canonical entity snapshot (uploads, report
   *   schedule CRUD, conversion uploads, bulk jobs); returns an `effect` object.
   */
  writeClass: "entity" | "effect";

  /** Canonical operations this tool can perform. */
  operation: CesteralWriteOperation[];

  /**
   * Top-level input arg names excluded from the `actionHash` binding — control
   * fields that are not part of the executable write identity (e.g. `dry_run`).
   * `__`-prefixed internal execution args are always excluded implicitly. The
   * decision-token verifier hashes the wire args minus this set.
   */
  executableArgsExclude: string[];

  /** Declares the tool honors the `dry_run` input flag and returns a dry-run result. */
  supportsDryRun?: boolean;
}

/**
 * Governed entity write tool. Mutates a canonical entity, so it MUST declare a
 * `readPartner` and promises validation + simulation (the governance admission
 * layer rejects the tool otherwise).
 */
export interface CesteralEntityWriteToolAnnotations extends CesteralWriteToolAnnotationsBase {
  writeClass: "entity";

  /**
   * Read tool that returns the canonical pre/post snapshot for this entity, so
   * the control plane can capture before/after state without an out-of-band
   * pairing.
   */
  readPartner: {
    toolName: string;
    /** Mapping from this write tool's arg name to the read tool's arg name. */
    argMap: Record<string, string>;
  };

  /** Entity writes always return canonical `before` / `after` snapshots. */
  supportsBeforeAfterSnapshot: true;

  /**
   * Contract promise: every governed call validates the proposed mutation
   * (native validator or symbolic) and never returns `validationSource:
   * "none"`. Always `true` for an entity write — admission rejects otherwise.
   */
  requiresValidation: true;

  /**
   * Contract promise: every governed call produces an expected post-state
   * (native simulator or symbolic apply) and never returns
   * `expectedStateSource: "none"`. Always `true` for an entity write.
   */
  requiresSimulation: true;
}

/**
 * Governed effect write tool. Has no canonical entity snapshot, so it carries
 * no `readPartner` and its validation/simulation promises are honest booleans
 * (some effect writes — e.g. fire-and-forget uploads — can neither validate
 * nor simulate). Returns an `effect` object instead of before/after snapshots.
 */
export interface CesteralEffectWriteToolAnnotations extends CesteralWriteToolAnnotationsBase {
  writeClass: "effect";

  /** Effect writes never produce canonical before/after snapshots. */
  supportsBeforeAfterSnapshot: false;

  /** Whether the tool validates the proposed write (symbolic where feasible). */
  requiresValidation: boolean;

  /** Whether the tool produces an expected effect (symbolic where feasible). */
  requiresSimulation: boolean;
}

/**
 * Governed write tool — discriminated on `writeClass`. A single tool may
 * dispatch to several canonical operations based on its input args; declare the
 * union and let consumers decide the effective operation per-call from the args.
 */
export type CesteralWriteToolAnnotations =
  | CesteralEntityWriteToolAnnotations
  | CesteralEffectWriteToolAnnotations;

/** Type guard: governed entity write annotation. */
export function isEntityWrite(a: CesteralToolAnnotations): a is CesteralEntityWriteToolAnnotations {
  return a.kind === "write" && a.writeClass === "entity";
}

/** Type guard: governed effect write annotation. */
export function isEffectWrite(a: CesteralToolAnnotations): a is CesteralEffectWriteToolAnnotations {
  return a.kind === "write" && a.writeClass === "effect";
}

/**
 * Read tool exposed for governance. Has no `operation` and no `readPartner`;
 * its purpose is discovery — consumers traverse `write.readPartner.toolName`
 * to find these and confirm they carry a matching contract id.
 */
export interface CesteralReadToolAnnotations extends CesteralToolAnnotationsBase {
  kind: "read";
}
