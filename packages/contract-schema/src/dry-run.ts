// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Governed write response shapes: dry-run results (entity + effect class),
 * the dispatched-capability tag every governed call carries, and the effect
 * result. TS interfaces are the canonical authoring contract; the Zod schemas
 * below are validation mirrors, pinned by a type-test.
 */

import { z } from "zod";

import { normalizedEntitySnapshotSchema, type NormalizedEntitySnapshot } from "./snapshot.js";

// =============================================================================
// DRY-RUN VALIDATION ERROR
// =============================================================================

export interface DryRunValidationError {
  code: string;
  message: string;
  /** Dotted path into the input args, when the error attaches to a field. */
  field?: string;
}

export const dryRunValidationErrorSchema: z.ZodType<DryRunValidationError> = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

// =============================================================================
// DRY-RUN RESULT (entity class)
// =============================================================================

/**
 * Result of a `dry_run: true` invocation on a governed entity-write tool.
 *
 * Validation and expected-state production are tagged independently because
 * platforms expose them asymmetrically — Google Ads `validate_only` returns
 * success/errors but no post-state; DV360 `get_delivery_estimate` returns a
 * post-state derivative without strict validation. Consumers use both axes to
 * weight confidence.
 */
export interface DryRunResult {
  wouldSucceed: boolean;
  validationErrors: DryRunValidationError[];
  /** Where validation came from. `"none"` only when no validation ran. */
  validationSource: "native_validator" | "symbolic" | "none";
  /** Where the expected post-state came from. `"none"` when no post-state was produced. */
  expectedStateSource: "native_simulator" | "server_symbolic_apply" | "none";
  /** Optional — present only when `expectedStateSource !== "none"`. */
  expectedPostState?: NormalizedEntitySnapshot;
}

export const dryRunResultSchema: z.ZodType<DryRunResult> = z.object({
  wouldSucceed: z.boolean(),
  validationErrors: z.array(dryRunValidationErrorSchema),
  validationSource: z.enum(["native_validator", "symbolic", "none"]),
  expectedStateSource: z.enum(["native_simulator", "server_symbolic_apply", "none"]),
  expectedPostState: normalizedEntitySnapshotSchema.optional(),
});

// =============================================================================
// DISPATCHED CAPABILITY
// =============================================================================

/**
 * The concrete `(operation, entityKind)` a single governed write call resolved
 * to. A governed write tool is a multi-operation dispatcher;
 * `dispatchedCapability` reports which capability a given call actually
 * exercised, derived from the call's input args.
 *
 * Required on every governed structured-content response in BOTH dry-run and
 * execute modes: the governance layer matches it against the tool's admitted
 * capability set on every call.
 */
export interface DispatchedCapability {
  /** Canonical write operation the call dispatched to. */
  operation: string;
  /**
   * Canonical entity kind the call targeted (snake_case `CanonicalEntityKind`),
   * or `null` for effect-class writes that have no canonical entity.
   */
  canonicalEntityKind: string | null;
}

export const dispatchedCapabilitySchema: z.ZodType<DispatchedCapability> = z.object({
  operation: z.string().min(1),
  // Nullable: effect-class writes (uploads, schedules, conversion uploads)
  // have no canonical entity kind.
  canonicalEntityKind: z.string().min(1).nullable(),
});

// =============================================================================
// EFFECT RESULT (effect class)
// =============================================================================

/**
 * Result of an effect-class write (no canonical entity snapshot): the
 * normalized identity of what the write produced. `summary` carries only
 * idempotency/audit identity (asset id, schedule id, accepted/rejected counts)
 * — never raw uploaded payloads or PII (redact at the call site).
 */
export interface EffectResult {
  /** Canonical effect kind, e.g. "asset_created", "schedule_created". */
  effectKind: string;
  /** Scalar-only identity/audit fields. */
  summary: Record<string, string | number | boolean | null>;
}

export const effectResultSchema: z.ZodType<EffectResult> = z.object({
  effectKind: z.string().min(1),
  summary: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

/**
 * Result of a `dry_run: true` invocation on an effect-class write tool. Mirrors
 * {@link DryRunResult} but produces an {@link EffectResult} preview instead of a
 * canonical entity post-state. `validationSource`/`expectedEffectSource` are
 * `"symbolic"` where feasible and `"none"` only when the tool genuinely cannot
 * validate/simulate (honest per the annotation's `requiresValidation` /
 * `requiresSimulation` booleans).
 */
export interface EffectDryRunResult {
  wouldSucceed: boolean;
  validationErrors: DryRunValidationError[];
  validationSource: "symbolic" | "none";
  expectedEffectSource: "symbolic" | "none";
  /** Present only when `expectedEffectSource !== "none"`. */
  expectedEffect?: EffectResult;
}

export const effectDryRunResultSchema: z.ZodType<EffectDryRunResult> = z.object({
  wouldSucceed: z.boolean(),
  validationErrors: z.array(dryRunValidationErrorSchema),
  validationSource: z.enum(["symbolic", "none"]),
  expectedEffectSource: z.enum(["symbolic", "none"]),
  expectedEffect: effectResultSchema.optional(),
});
