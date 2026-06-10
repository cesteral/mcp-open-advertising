// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The `cesteral.*` annotation namespace declared on governed write/read tools.
 *
 * Lives inside the standard MCP `annotations` object. Non-Cesteral clients
 * ignore namespaces they do not understand; Cesteral consumers read this block
 * to admit, govern, and reconcile external write operations without maintaining
 * an out-of-band registry.
 *
 * Two faces, deliberately different strictness, kept in one file so they cannot
 * drift:
 *
 * - **Authoring types** (`CesteralToolAnnotations` and friends) are the STRICT
 *   contract MCP-server authors write against via `satisfies`. An entity write
 *   MUST declare `requiresValidation: true` / `requiresSimulation: true` /
 *   `supportsBeforeAfterSnapshot: true` and a `readPartner`.
 * - **Validation schema** (`cesteralAnnotationSchema`, `parseCesteralAnnotation`)
 *   is the LOOSE shape governance parses untrusted tool lists with. It does not
 *   require the contract-promise literals — governance applies those as separate
 *   admission checks so it can emit specific reason codes
 *   (`missingRequiresValidation`, etc.) rather than a generic parse failure.
 *
 * A value satisfying an authoring type always parses under the schema; the
 * package's type-tests pin that relationship.
 */

import { z } from "zod";

import type { CanonicalEntityKind } from "./entity-kind.js";
import { canonicalEntityKindSchema } from "./entity-kind.js";
import {
  CESTERAL_WRITE_OPERATIONS,
  writeOperationSchema,
  type CesteralWriteOperation,
} from "./write-operation.js";
import { schemaVersionSchema, slugSchema } from "./slug.js";

// Re-exported so consumers can import the canonical operation set / kind set
// alongside the annotation types from one module.
export { CESTERAL_WRITE_OPERATIONS, type CesteralWriteOperation };
export type { CanonicalEntityKind };

// =============================================================================
// AUTHORING TYPES (strict — MCP-server `satisfies` contract)
// =============================================================================

/**
 * Discriminated by `kind`:
 * - `"write"` — governed mutation; carries `operation` and (entity-class) a
 *   `readPartner` pointer so consumers can capture pre/post snapshots.
 * - `"read"` — read partner exposed for governance discovery; no operation or
 *   readPartner. Cesteral consumers list these to verify a write tool's declared
 *   `readPartner.toolName` resolves to a real, contract-tagged tool.
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

  /** Tool component of `contractId`. Same slug shape as `contractPlatformSlug`. */
  contractToolSlug: string;

  /**
   * Entity types this tool can write or read. Reuses the snapshot's
   * `CanonicalEntityKind` so annotations and snapshots stay in lockstep.
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

/**
 * Read tool exposed for governance. Has no `operation` and no `readPartner`;
 * its purpose is discovery — consumers traverse `write.readPartner.toolName`
 * to find these and confirm they carry a matching contract id.
 */
export interface CesteralReadToolAnnotations extends CesteralToolAnnotationsBase {
  kind: "read";
}

/** Type guard: governed entity write annotation. */
export function isEntityWrite(a: CesteralToolAnnotations): a is CesteralEntityWriteToolAnnotations {
  return a.kind === "write" && a.writeClass === "entity";
}

/** Type guard: governed effect write annotation. */
export function isEffectWrite(a: CesteralToolAnnotations): a is CesteralEffectWriteToolAnnotations {
  return a.kind === "write" && a.writeClass === "effect";
}

// =============================================================================
// VALIDATION SCHEMA (loose — governance parse of untrusted tool lists)
// =============================================================================

/** Identity fields shared by every governed tool, regardless of kind. */
const baseAnnotationFields = {
  platform: z.string().min(1),
  contractPlatformSlug: slugSchema,
  contractToolSlug: slugSchema,
  schemaVersion: schemaVersionSchema,
  contractId: z.string(),
};

/** Entity identity — required (non-empty) for read + entity-write tools. */
const requiredEntityKinds = z.array(canonicalEntityKindSchema).min(1);
const requiredEntityIdArgs = z.array(z.string().min(1)).min(1);

function applyContractIdConsistency<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const v = value as {
      contractPlatformSlug: string;
      contractToolSlug: string;
      schemaVersion: number;
      contractId: string;
    };
    const expected = `${v.contractPlatformSlug}.${v.contractToolSlug}.v${v.schemaVersion}`;
    if (v.contractId !== expected) {
      ctx.addIssue({
        // String literal (not `z.ZodIssueCode.custom`) so the schema constructs
        // identically under both zod 3 and zod 4 — zod 4 removed the enum.
        code: "custom",
        path: ["contractId"],
        message: `contractId must equal deriveContractId(contractPlatformSlug, contractToolSlug, schemaVersion). Expected '${expected}', got '${v.contractId}'.`,
      });
    }
  });
}

/** Fields shared by both write arms (entity + effect). */
const writeBaseFields = {
  kind: z.literal("write"),
  ...baseAnnotationFields,
  operation: z.array(writeOperationSchema).min(1),
  /**
   * Top-level arg names excluded from the `actionHash` binding — control
   * fields that are not part of the executable write identity (e.g. `dry_run`).
   * Optional for tolerance of annotations minted before the field existed;
   * `canonicalizeExecutableArgs` strips these (plus `__`-prefixed args) before
   * hashing so the connector and governance bind the same action identity.
   */
  executableArgsExclude: z.array(z.string()).optional(),
  supportsDryRun: z.boolean().optional(),
  supportsBeforeAfterSnapshot: z.boolean().optional(),
};

/**
 * Entity-class write — mutates a canonical entity, so it MUST declare a
 * `readPartner` and a non-empty entity identity. Mirrors
 * {@link CesteralEntityWriteToolAnnotations}.
 */
const entityWriteShape = z.object({
  ...writeBaseFields,
  writeClass: z.literal("entity"),
  entityKinds: requiredEntityKinds,
  entityIdArgs: requiredEntityIdArgs,
  readPartner: z.object({
    toolName: z.string().min(1),
    argMap: z.record(z.string(), z.string()),
  }),
});

/**
 * Effect-class write — no canonical entity snapshot, so it carries no
 * `readPartner` and its entity identity may be empty (uploads, report-schedule
 * CRUD, conversion uploads, bulk jobs). Mirrors
 * {@link CesteralEffectWriteToolAnnotations}.
 */
const effectWriteShape = z.object({
  ...writeBaseFields,
  writeClass: z.literal("effect"),
  entityKinds: z.array(canonicalEntityKindSchema),
  entityIdArgs: z.array(z.string().min(1)),
});

const writeAnnotationShape = z.discriminatedUnion("writeClass", [
  entityWriteShape,
  effectWriteShape,
]);

const readAnnotationShape = z.object({
  kind: z.literal("read"),
  ...baseAnnotationFields,
  entityKinds: requiredEntityKinds,
  entityIdArgs: requiredEntityIdArgs,
});

// ---------------------------------------------------------------------------
// Validation (loose) types — the parsed shape of an untrusted annotation.
// Hand-written PLAIN types (not `z.infer`) so the emitted `.d.ts` carries no
// zod-version-specific structure; each `z.ZodType<…>` schema annotation below
// self-checks the mirror against its concrete schema at build time. These are
// looser than the authoring types above (no strict `requiresValidation: true`
// literals — governance applies those as separate admission checks). The zod-3
// fleet and the zod-4 governance layer both resolve clean types (and
// `schema.safeParse().error.issues`) through their own peer zod.
// ---------------------------------------------------------------------------

interface CesteralParsedAnnotationBase {
  platform: string;
  contractPlatformSlug: string;
  contractToolSlug: string;
  schemaVersion: number;
  contractId: string;
}

interface CesteralParsedWriteAnnotationBase extends CesteralParsedAnnotationBase {
  kind: "write";
  operation: CesteralWriteOperation[];
  executableArgsExclude?: string[];
  supportsDryRun?: boolean;
  supportsBeforeAfterSnapshot?: boolean;
}

export interface CesteralEntityWriteAnnotation extends CesteralParsedWriteAnnotationBase {
  writeClass: "entity";
  entityKinds: CanonicalEntityKind[];
  entityIdArgs: string[];
  readPartner: { toolName: string; argMap: Record<string, string> };
}

export interface CesteralEffectWriteAnnotation extends CesteralParsedWriteAnnotationBase {
  writeClass: "effect";
  entityKinds: CanonicalEntityKind[];
  entityIdArgs: string[];
}

export type CesteralWriteAnnotation = CesteralEntityWriteAnnotation | CesteralEffectWriteAnnotation;

export interface CesteralReadAnnotation extends CesteralParsedAnnotationBase {
  kind: "read";
  entityKinds: CanonicalEntityKind[];
  entityIdArgs: string[];
}

export type CesteralAnnotation = CesteralWriteAnnotation | CesteralReadAnnotation;

export const cesteralWriteAnnotationSchema: z.ZodType<CesteralWriteAnnotation> =
  applyContractIdConsistency(writeAnnotationShape);
export const cesteralReadAnnotationSchema: z.ZodType<CesteralReadAnnotation> =
  applyContractIdConsistency(readAnnotationShape);
// Top-level cannot be a single `discriminatedUnion("kind", …)` because the
// write arm is itself a `discriminatedUnion("writeClass", …)`; a plain union
// of the two arms gives the same parse result with slightly broader errors.
export const cesteralAnnotationSchema: z.ZodType<CesteralAnnotation> = applyContractIdConsistency(
  z.union([writeAnnotationShape, readAnnotationShape])
);

export function parseCesteralAnnotation(
  value: unknown
):
  | { success: true; data: CesteralAnnotation }
  | { success: false; error: z.ZodError } {
  const r = cesteralAnnotationSchema.safeParse(value);
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data };
}
