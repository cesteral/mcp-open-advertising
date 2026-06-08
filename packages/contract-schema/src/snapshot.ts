// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical pre/post-write entity snapshot exchanged between MCP servers and
 * the Cesteral governance layer. Both repos build against this one source of
 * truth so a write's before/after state means the same thing on each side.
 *
 * Money is always in minor units with ISO currency. Status preserves the
 * original platform value alongside the normalized canonical value so
 * consumers never lose information needed for audit or escalation.
 *
 * The TS interfaces below are the canonical authoring contract;
 * {@link normalizedEntitySnapshotSchema} is the Zod validation mirror, pinned
 * to them by a type-test.
 */

import { z } from "zod";

import { canonicalEntityKindSchema } from "./entity-kind.js";

export interface MoneyAmount {
  amountMinor: number;
  currency: string;
}

/**
 * One flighted budget segment. Platforms whose lifetime budget is inherently
 * flighted (DV360 InsertionOrder) preserve segment-level fidelity here so
 * contracts can detect segment-count or date-range changes that flat sums
 * would hide.
 */
export interface BudgetSegmentSnapshot {
  amountMinor: number;
  currency: string;
  startAt: string | null;
  endAt: string | null;
}

export interface BudgetSnapshot {
  daily?: MoneyAmount | null;
  lifetime?: MoneyAmount | null;
  /** Sum across `segments` is mirrored to `lifetime` for flat-budget consumers. */
  segments?: BudgetSegmentSnapshot[] | null;
}

export type CanonicalStatus = "active" | "paused" | "archived" | "deleted" | "unknown";

export interface StatusSnapshot {
  canonical: CanonicalStatus;
  /** Original platform-native status string (e.g. "ENTITY_STATUS_PAUSED"). */
  platformRaw: string;
}

export interface ScheduleSnapshot {
  startAt: string | null;
  endAt: string | null;
}

export interface NormalizedEntitySnapshot {
  /** Pinned at 1 so consumers can detect drift in the canonical state shape. */
  schemaVersion: 1;
  platform: string;
  entityKind: z.infer<typeof canonicalEntityKindSchema>;
  platformEntityId: string;
  displayName: string | null;
  accountId: string | null;
  status: StatusSnapshot;
  budget: BudgetSnapshot;
  schedule: ScheduleSnapshot;
}

// =============================================================================
// ZOD MIRRORS
// =============================================================================

const moneyAmountSchema = z.object({
  amountMinor: z.number(),
  currency: z.string(),
});

const budgetSegmentSnapshotSchema = z.object({
  amountMinor: z.number(),
  currency: z.string(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
});

const budgetSnapshotSchema = z.object({
  daily: moneyAmountSchema.nullable().optional(),
  lifetime: moneyAmountSchema.nullable().optional(),
  segments: z.array(budgetSegmentSnapshotSchema).nullable().optional(),
});

const statusSnapshotSchema = z.object({
  canonical: z.enum(["active", "paused", "archived", "deleted", "unknown"]),
  platformRaw: z.string(),
});

const scheduleSnapshotSchema = z.object({
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
});

export const normalizedEntitySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  platform: z.string(),
  entityKind: canonicalEntityKindSchema,
  platformEntityId: z.string(),
  displayName: z.string().nullable(),
  accountId: z.string().nullable(),
  status: statusSnapshotSchema,
  budget: budgetSnapshotSchema,
  schedule: scheduleSnapshotSchema,
});
