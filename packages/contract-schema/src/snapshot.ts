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

import { canonicalEntityKindSchema, type CanonicalEntityKind } from "./entity-kind.js";

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

/**
 * Ancestor kinds a snapshot can name. An advertiser is `accountId`, and the
 * level of the entity itself is `entityKind`, so only the levels strictly
 * between them are ever parents: a campaign above an ad set / ad group, or an
 * insertion order above a line item.
 */
export type SnapshotParentKind = "campaign" | "insertion_order";

/**
 * One ancestor of the snapshotted entity, as the platform's own read-back names
 * it. `id` is in the form the connector uses as `platformEntityId` for that
 * ancestor, so a consumer can compare it with a control scoped to the ancestor.
 */
export interface SnapshotParent {
  kind: SnapshotParentKind;
  id: string;
  /** Omitted when the read-back did not carry a name; never invented. */
  name?: string;
}

export interface NormalizedEntitySnapshot {
  /** Pinned at 1 so consumers can detect drift in the canonical state shape. */
  schemaVersion: 1;
  platform: string;
  entityKind: CanonicalEntityKind;
  platformEntityId: string;
  displayName: string | null;
  accountId: string | null;
  status: StatusSnapshot;
  budget: BudgetSnapshot;
  schedule: ScheduleSnapshot;
  /**
   * Ancestors the platform's read-back names, at most one per kind and at most
   * 4. ABSENT means unknown, never "has none": the key is omitted, not sent
   * empty, when the read-back names no parent. Only levels above the entity
   * count (a campaign snapshot has no parents).
   */
  parents?: SnapshotParent[];
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

const snapshotParentSchema = z.object({
  kind: z.enum(["campaign", "insertion_order"]),
  id: z.string().min(1),
  name: z.string().optional(),
});

// Annotated `z.ZodType<NormalizedEntitySnapshot>` so the emitted `.d.ts` exposes
// the plain interface, not a zod-version-specific `ZodObject` — consumers on any
// zod major resolve clean types (and `schema.safeParse().error.issues`) through
// their own peer zod.
export const normalizedEntitySnapshotSchema: z.ZodType<NormalizedEntitySnapshot> = z.object({
  schemaVersion: z.literal(1),
  platform: z.string(),
  entityKind: canonicalEntityKindSchema,
  platformEntityId: z.string(),
  displayName: z.string().nullable(),
  accountId: z.string().nullable(),
  status: statusSnapshotSchema,
  budget: budgetSnapshotSchema,
  schedule: scheduleSnapshotSchema,
  parents: z.array(snapshotParentSchema).max(4).optional(),
});
