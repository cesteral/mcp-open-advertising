// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical pre/post-write entity snapshot exchanged between MCP servers and
 * the Cesteral governance layer. Mirrors the shape consumed by
 * `cesteral-intelligence` (`lib/features/ad-platform/normalization/snapshot.ts`)
 * so that both repos build against one source of truth.
 *
 * Money is always in minor units with ISO currency. Status preserves the
 * original platform value alongside the normalized canonical value so
 * consumers never lose information needed for audit or escalation.
 */

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

export type CanonicalEntityKind =
  | "campaign"
  | "ad_set"
  | "insertion_order"
  | "line_item"
  | "ad_group"
  | "ad"
  | "campaign_budget"
  | "order"
  | "commitment";

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
}
