// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for Meta `update_entity`. PR-D wiring.
 *
 * Extracted from `dry-run.ts` so the same read-and-normalize logic is reused
 * for:
 * - Symbolic dry-run (PR-C): read current entity, overlay patch, normalize.
 * - Real-write before/after (PR-D): read pre-state at handler start, execute
 *   the write, read post-state (since Meta's update endpoint returns only
 *   `{ success: true }`), normalize both.
 *
 * Reference data scope is intentionally narrow — the canonical shape covers
 * status, daily/lifetime budget (cents), and basic schedule. Anything outside
 * that surface is round-2.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface MetaServiceLike {
  // Loosened from `MetaService.getEntity` (typed against `MetaEntityType`)
  // so we can accept arbitrary `entityType` strings without leaking the
  // platform-specific union into the helper.
  getEntity?: (
    entityType: any,
    entityId: string,
    fields?: string[] | undefined,
    context?: RequestContext
  ) => Promise<unknown>;
}

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
  ARCHIVED: "archived",
  DELETED: "deleted",
};

export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adSet: "ad_set",
  ad: "ad",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

function toMoney(
  amount: unknown,
  currency: string
): { amountMinor: number; currency: string } | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number.parseInt(amount, 10) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return { amountMinor: n, currency };
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot.
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and
 * the real-write `after` capture (patch = `{}`, current = post-write read).
 */
export function buildMetaSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged: Record<string, unknown> = { ...current, ...patch };
  const currency =
    (typeof current.currency === "string" && current.currency) ||
    (typeof current.account_currency === "string" && current.account_currency) ||
    "USD";

  const daily = toMoney(merged.daily_budget, currency);
  const lifetime = toMoney(merged.lifetime_budget, currency);

  return {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId:
      typeof current.account_id === "string"
        ? current.account_id
        : typeof current.adAccountId === "string"
          ? current.adAccountId
          : null,
    status: normalizeStatus(merged.status ?? current.status),
    budget: {
      daily: daily ?? null,
      lifetime: lifetime ?? null,
    },
    schedule: {
      startAt: typeof merged.start_time === "string" ? merged.start_time : null,
      endAt: typeof merged.end_time === "string" ? merged.end_time : null,
    },
  };
}

/**
 * Read the entity through the service-layer abstraction and normalize.
 * Returns `undefined` if the entity type is not in the canonical scope or
 * the read fails — callers leave the corresponding `before`/`after` field
 * `undefined` rather than throwing.
 */
export async function captureMetaSnapshot(
  metaService: MetaServiceLike,
  entityType: string | undefined,
  entityId: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!entityType || !ENTITY_KIND_MAP[entityType] || !metaService.getEntity) return undefined;
  try {
    const current = (await metaService.getEntity(entityType, entityId, undefined, context)) as
      | Record<string, unknown>
      | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildMetaSnapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}
