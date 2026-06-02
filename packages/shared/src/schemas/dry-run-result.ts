// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Zod mirror of the {@link DryRunResult} TypeScript interface in
 * `../types/dry-run-result.ts`. Tool `outputSchema` fields are Zod, but the
 * canonical contract definition in `@cesteral/shared` is a TS interface so
 * downstream consumers can type-check against it without depending on Zod.
 *
 * The two definitions are kept in lockstep by a `expectTypeOf` test in
 * `tests/schemas/dry-run-result.test.ts` — drift between them is a build-break.
 */

import { z } from "zod";

export const DryRunValidationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
});

const MoneyAmountSchema = z.object({
  amountMinor: z.number(),
  currency: z.string(),
});

const BudgetSegmentSnapshotSchema = z.object({
  amountMinor: z.number(),
  currency: z.string(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
});

const BudgetSnapshotSchema = z.object({
  daily: MoneyAmountSchema.nullable().optional(),
  lifetime: MoneyAmountSchema.nullable().optional(),
  segments: z.array(BudgetSegmentSnapshotSchema).nullable().optional(),
});

const StatusSnapshotSchema = z.object({
  canonical: z.enum(["active", "paused", "archived", "deleted", "unknown"]),
  platformRaw: z.string(),
});

const ScheduleSnapshotSchema = z.object({
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
});

const CanonicalEntityKindSchema = z.enum([
  "campaign",
  "ad_set",
  "insertion_order",
  "line_item",
  "ad_group",
  "ad",
  "campaign_budget",
  "order",
  "commitment",
]);

export const NormalizedEntitySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  platform: z.string(),
  entityKind: CanonicalEntityKindSchema,
  platformEntityId: z.string(),
  displayName: z.string().nullable(),
  accountId: z.string().nullable(),
  status: StatusSnapshotSchema,
  budget: BudgetSnapshotSchema,
  schedule: ScheduleSnapshotSchema,
});

export const DryRunResultSchema = z.object({
  wouldSucceed: z.boolean(),
  validationErrors: z.array(DryRunValidationErrorSchema),
  validationSource: z.enum(["native_validator", "symbolic", "none"]),
  expectedStateSource: z.enum(["native_simulator", "server_symbolic_apply", "none"]),
  expectedPostState: NormalizedEntitySnapshotSchema.optional(),
});

/**
 * Zod mirror of the {@link DispatchedCapability} interface in
 * `../types/dry-run-result.ts`. Governed write tools place this on every
 * structured-content response; the governance layer parses it with the same
 * shape: `operation` is a non-empty string, and `canonicalEntityKind` is a
 * non-empty string for entity writes or `null` for effect writes.
 */
export const DispatchedCapabilitySchema = z.object({
  operation: z.string().min(1),
  // Nullable: effect-class writes (uploads, schedules, conversion uploads)
  // have no canonical entity kind.
  canonicalEntityKind: z.string().min(1).nullable(),
});

/**
 * Zod mirror of the {@link EffectResult} interface. `summary` is scalar-only
 * (no nested objects/arrays) so it stays a flat, auditable identity record.
 */
export const EffectResultSchema = z.object({
  effectKind: z.string().min(1),
  summary: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

/**
 * Zod mirror of the {@link EffectDryRunResult} interface — the effect-class
 * parallel to {@link DryRunResultSchema}.
 */
export const EffectDryRunResultSchema = z.object({
  wouldSucceed: z.boolean(),
  validationErrors: z.array(DryRunValidationErrorSchema),
  validationSource: z.enum(["symbolic", "none"]),
  expectedEffectSource: z.enum(["symbolic", "none"]),
  expectedEffect: EffectResultSchema.optional(),
});
