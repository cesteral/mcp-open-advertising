// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for Pinterest `update_entity`. R4-U4 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R4-U4): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R4-U4): read pre-state at handler start, execute
 *   the PATCH, normalize the updated entity the PATCH returns (with a re-read
 *   fallback), normalize both.
 *
 * Governed scope is `campaign`, `adGroup` (ad-group-equivalent) and `ad` — the
 * Pinterest entities that carry an `EntityStatus`. `creative` (Pin) has no
 * canonical entity kind and falls through.
 *
 * Pinterest budget amounts are expressed in micro-currency (1,000,000 micro =
 * 1 major unit). The canonical snapshot stores minor units (major × 100), so
 * micro amounts are ÷10,000. Pinterest schedule fields are Unix timestamps in
 * seconds; the canonical snapshot stores ISO-8601 strings.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface PinterestServiceLike {
  // Loosened from `PinterestService.getEntity` (generic over the entity-type
  // union) so the helper accepts arbitrary `entityType` strings.
  getEntity?: (
    entityType: any,
    filters: { adAccountId: string },
    entityId: string,
    context?: RequestContext
  ) => Promise<unknown>;
}

/**
 * Public `entityType` input → canonical kind. Pinterest's `campaign` is the
 * campaign-level object, `adGroup` the ad-group-level object, `ad` the ad-level
 * object. `creative` (Pin) has no canonical kind and is intentionally absent.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adGroup: "ad_group",
  ad: "ad",
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
  ARCHIVED: "archived",
  DRAFT: "unknown",
  DELETED_DRAFT: "deleted",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

/**
 * Micro-currency → minor units. 1,000,000 micro = 1 major = 100 minor, so the
 * conversion is ÷10,000. `5_000_000` micro ($5.00) → `500` cents.
 */
function microToMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n / 10_000);
}

/** Unix-seconds timestamp → ISO-8601 string. Returns null for absent/invalid. */
function unixSecondsToIso(value: unknown): string | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot. Pinterest
 * updates are partial-field PATCH overlays, so the patch is a shallow overlay
 * (mirrors the platform's own write semantics).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildPinterestSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  // Budget shape differs by entity kind:
  // - campaign carries flat `daily_spend_cap` / `lifetime_spend_cap` micro
  //   amounts (the two are mutually exclusive on Pinterest).
  // - ad_group carries a single `budget_in_micro_currency` with a sibling
  //   `budget_type` (DAILY | LIFETIME | CBO_ADGROUP) that selects the slot.
  // - ad has no budget.
  let daily: { amountMinor: number; currency: string } | null = null;
  let lifetime: { amountMinor: number; currency: string } | null = null;
  const currency = "USD";

  if (entityKind === "campaign") {
    const dailyMinor = microToMinor(merged.daily_spend_cap);
    const lifetimeMinor = microToMinor(merged.lifetime_spend_cap);
    daily = dailyMinor != null ? { amountMinor: dailyMinor, currency } : null;
    lifetime = lifetimeMinor != null ? { amountMinor: lifetimeMinor, currency } : null;
  } else if (entityKind === "ad_group") {
    const amountMinor = microToMinor(merged.budget_in_micro_currency);
    const money = amountMinor != null ? { amountMinor, currency } : null;
    if (merged.budget_type === "DAILY") {
      daily = money;
    } else if (merged.budget_type === "LIFETIME") {
      lifetime = money;
    }
  }

  return {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId: typeof merged.ad_account_id === "string" ? merged.ad_account_id : null,
    status: normalizeStatus(merged.status),
    budget: {
      daily,
      lifetime,
    },
    schedule: {
      startAt: unixSecondsToIso(merged.start_time),
      endAt: unixSecondsToIso(merged.end_time),
    },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function capturePinterestSnapshot(
  service: PinterestServiceLike,
  entityType: string,
  adAccountId: string,
  entityId: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !service.getEntity) return undefined;
  try {
    const current = (await service.getEntity(entityType, { adAccountId }, entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildPinterestSnapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity returned by the
 * Pinterest PATCH). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (status, name, budget) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromPinterestEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.status == null &&
      entity.name == null &&
      entity.daily_spend_cap == null &&
      entity.lifetime_spend_cap == null &&
      entity.budget_in_micro_currency == null)
  ) {
    return undefined;
  }
  const snapshot = buildPinterestSnapshot(entityType, entityId, entity, {});
  return snapshot ?? undefined;
}
