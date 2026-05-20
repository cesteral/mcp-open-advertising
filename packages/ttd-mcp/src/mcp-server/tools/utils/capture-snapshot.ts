// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for TTD `update_entity`. R3-U2 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R3-U2): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R3-U2): read pre-state at handler start, execute
 *   the PUT, normalize the updated entity the PUT returns (with a re-read
 *   fallback), normalize both.
 *
 * Governed scope is `campaign` and `adGroup` — the TTD entities that carry an
 * `Availability` status. `advertiser` / `creative` / `conversionTracker` have
 * no canonical entity kind and fall through.
 *
 * TTD budget amounts (`DailyBudget`, `Budget`) are `{ Amount, CurrencyCode }`
 * objects in the advertiser-currency major units; the canonical snapshot
 * stores minor units, so amounts are ×100. `campaign` carries both budget
 * fields; `adGroup` budget lives in `RTBAttributes.BudgetSettings` which is
 * out of round-3 scope, so an `adGroup` snapshot carries no budget.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface TtdServiceLike {
  // Loosened from `TtdService.getEntity` (generic over the entity-type union)
  // so the helper accepts arbitrary `entityType` strings.
  getEntity?: (entityType: any, entityId: string, context?: RequestContext) => Promise<unknown>;
}

/**
 * Public `entityType` input → canonical kind. TTD's `campaign` is the
 * campaign-level object and `adGroup` the ad-group-level object.
 * `advertiser` / `creative` / `conversionTracker` are out of governed scope.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adGroup: "ad_group",
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  Available: "active",
  Paused: "paused",
  Archived: "archived",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

/** Currency major units → minor units. `123.45` USD → `12345` cents. */
function toMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

/** Normalize a TTD `{ Amount, CurrencyCode }` budget object → canonical money. */
function toMoney(raw: unknown): { amountMinor: number; currency: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const budget = raw as Record<string, unknown>;
  const amountMinor = toMinor(budget.Amount);
  if (amountMinor == null) return null;
  const currency = typeof budget.CurrencyCode === "string" ? budget.CurrencyCode : "USD";
  return { amountMinor, currency };
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot. TTD
 * updates replace the provided fields, so the patch is a shallow overlay
 * (mirrors the platform's own PUT semantics).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildTtdSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  // Budget: `campaign` carries `DailyBudget` / `Budget` objects directly.
  // `adGroup` budget lives in a nested `RTBAttributes.BudgetSettings` array
  // that is out of round-3 scope — leave both null.
  const daily = entityKind === "campaign" ? toMoney(merged.DailyBudget) : null;
  const lifetime = entityKind === "campaign" ? toMoney(merged.Budget) : null;

  const nameField = entityKind === "campaign" ? "CampaignName" : "AdGroupName";

  return {
    schemaVersion: 1,
    platform: "ttd",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged[nameField] === "string" ? merged[nameField] : null,
    accountId: typeof merged.AdvertiserId === "string" ? merged.AdvertiserId : null,
    status: normalizeStatus(merged.Availability),
    budget: {
      daily,
      lifetime,
    },
    schedule: {
      startAt: typeof merged.StartDateInclusiveUTC === "string" ? merged.StartDateInclusiveUTC : null,
      endAt: typeof merged.EndDateExclusiveUTC === "string" ? merged.EndDateExclusiveUTC : null,
    },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureTtdSnapshot(
  service: TtdServiceLike,
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
    const snapshot = buildTtdSnapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity returned by the
 * TTD PUT). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (Availability, name, budget) — callers should fall back to
 * a re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromTtdEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  const nameField = ENTITY_KIND_MAP[entityType] === "campaign" ? "CampaignName" : "AdGroupName";
  if (
    !entity ||
    (entity.Availability == null &&
      entity[nameField] == null &&
      entity.Budget == null &&
      entity.DailyBudget == null)
  ) {
    return undefined;
  }
  const snapshot = buildTtdSnapshot(entityType, entityId, entity, {});
  return snapshot ?? undefined;
}
