// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for Snapchat `update_entity`. R4-U3 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R4-U3): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R4-U3): read pre-state at handler start, execute
 *   the PUT, normalize the updated entity the PUT returns (with a re-read
 *   fallback), normalize both.
 *
 * Governed scope is `campaign`, `adGroup` (Snapchat "ad squad" — the
 * ad-group tier), and `ad` — the Snapchat entities that carry a canonical
 * `status`. `creative` has no canonical entity kind and falls through.
 *
 * Snapchat budget/bid amounts are expressed in micro-currency (1/1,000,000 of
 * a currency unit). The canonical snapshot stores minor units (1/100), so
 * micro amounts are divided by 10,000.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface SnapchatServiceLike {
  // Loosened from `SnapchatService.getEntity` (generic over the entity-type
  // union) so the helper accepts arbitrary `entityType` strings.
  getEntity?: (entityType: any, entityId: string, context?: RequestContext) => Promise<unknown>;
}

/**
 * Public `entityType` input → canonical kind. Snapchat's "ad squad" is the
 * ad-group-level object and is exposed via the `adGroup` input key. `creative`
 * has no canonical kind and is intentionally absent.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adGroup: "ad_group",
  ad: "ad",
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

/** Micro-currency → minor units. `200000000` micros → `20000` cents ($200.00). */
function microToMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n / 10_000);
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot.
 * Snapchat updates merge the patch over the current entity (the service layer
 * fetches the current entity and sends a full-object PUT), so the patch is a
 * shallow overlay here too.
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildSnapchatSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  // Budget lives only on campaign / ad squad; ads carry no budget. Both
  // budget tiers are micro-currency fields on the entity.
  const dailyMinor = microToMinor(merged.daily_budget_micro);
  const lifetimeMinor = microToMinor(merged.lifetime_budget_micro);

  return {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId: typeof merged.ad_account_id === "string" ? merged.ad_account_id : null,
    status: normalizeStatus(merged.status),
    budget: {
      daily: dailyMinor != null ? { amountMinor: dailyMinor, currency: "USD" } : null,
      lifetime: lifetimeMinor != null ? { amountMinor: lifetimeMinor, currency: "USD" } : null,
    },
    schedule: {
      startAt: typeof merged.start_time === "string" ? merged.start_time : null,
      endAt: typeof merged.end_time === "string" ? merged.end_time : null,
    },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureSnapchotSnapshot(
  service: SnapchatServiceLike,
  entityType: string,
  entityId: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !service.getEntity) return undefined;
  try {
    const current = (await service.getEntity(entityType, entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildSnapchatSnapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity returned by the
 * Snapchat PUT). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (status, name, budget) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromSnapchatEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.status == null &&
      entity.name == null &&
      entity.daily_budget_micro == null &&
      entity.lifetime_budget_micro == null)
  ) {
    return undefined;
  }
  const snapshot = buildSnapchatSnapshot(entityType, entityId, entity, {});
  return snapshot ?? undefined;
}
