// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * @cesteral/contract-schema — the canonical governance-contract surface shared
 * by the Cesteral MCP servers (`mcp-open-advertising`) and the governance
 * layer (`cesteral-intelligence`).
 *
 * One source of truth for: the `cesteral.*` tool annotations (strict authoring
 * types + loose validation schema), the canonical write-operation and
 * entity-kind enums, `contractId` derivation, the governed dry-run/snapshot
 * response shapes, and the per-release attestation manifest schema.
 *
 * Companion package `@cesteral/contract-hash` owns the canonical SHA-256 hash
 * of a tool definition; this package owns the SHAPE of what gets hashed and
 * governed.
 */

// Slug / contractId
export {
  SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  slugSchema,
  schemaVersionSchema,
  deriveContractId,
  safeDeriveContractId,
  type ContractPlatformSlug,
  type ContractToolSlug,
} from "./slug.js";

// Canonical enums
export { canonicalEntityKindSchema, type CanonicalEntityKind } from "./entity-kind.js";
export {
  CESTERAL_WRITE_OPERATIONS,
  writeOperationSchema,
  type CesteralWriteOperation,
} from "./write-operation.js";

// Annotations — authoring types + validation schema
export {
  isEntityWrite,
  isEffectWrite,
  cesteralWriteAnnotationSchema,
  cesteralReadAnnotationSchema,
  cesteralAnnotationSchema,
  parseCesteralAnnotation,
  type CesteralToolAnnotations,
  type CesteralWriteToolAnnotations,
  type CesteralEntityWriteToolAnnotations,
  type CesteralEffectWriteToolAnnotations,
  type CesteralReadToolAnnotations,
  type CesteralWriteAnnotation,
  type CesteralReadAnnotation,
  type CesteralAnnotation,
} from "./annotations.js";

// Canonical entity snapshot
export {
  normalizedEntitySnapshotSchema,
  type NormalizedEntitySnapshot,
  type MoneyAmount,
  type BudgetSegmentSnapshot,
  type BudgetSnapshot,
  type CanonicalStatus,
  type StatusSnapshot,
  type ScheduleSnapshot,
} from "./snapshot.js";

// Governed write response shapes
export {
  dryRunValidationErrorSchema,
  dryRunResultSchema,
  dispatchedCapabilitySchema,
  effectResultSchema,
  effectDryRunResultSchema,
  type DryRunValidationError,
  type DryRunResult,
  type DispatchedCapability,
  type EffectResult,
  type EffectDryRunResult,
} from "./dry-run.js";

// Release attestation manifest
export {
  cesteralManifestSchema,
  type CesteralManifest,
  type CesteralManifestTool,
} from "./manifest.js";

// Cross-repo annotation-schema parity vector (single-sourced; mirrors
// @cesteral/contract-hash's CROSS_REPO_DEFINITION_HASH_GOLDEN).
export { CROSS_REPO_ANNOTATION_PARITY_GOLDEN } from "./cross-repo-golden.js";
