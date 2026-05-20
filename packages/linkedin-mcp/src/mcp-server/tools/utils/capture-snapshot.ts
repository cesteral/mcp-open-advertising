// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for LinkedIn `update_entity`. R3-U3 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R3-U3): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R3-U3): read pre-state at handler start, execute
 *   the partial update, normalize the entity the update returns (with a
 *   re-read fallback), normalize both.
 *
 * Governed scope is `campaign` only — the LinkedIn entity that carries a
 * canonical `status` and budgets. LinkedIn `campaignGroup` is intentionally
 * OUT of scope (a governance taxonomy decision is pending); `creative` /
 * `adAccount` / `conversionRule` have no canonical entity kind and fall
 * through.
 *
 * LinkedIn budget amounts (`dailyBudget` / `totalBudget`) are `{ amount,
 * currencyCode }` where `amount` is a major-units decimal string; the
 * canonical snapshot stores minor units, so amounts are ×100.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface LinkedInServiceLike {
  // Loosened from `LinkedInService.getEntity` (generic over the entity-type
  // union) so the helper accepts arbitrary `entityType` strings.
  getEntity?: (entityType: any, entityUrn: string, context?: RequestContext) => Promise<unknown>;
}

/**
 * Public `entityType` input → canonical kind. LinkedIn's `campaign` is the
 * campaign-level object. `campaignGroup` is deliberately omitted (governance
 * taxonomy decision pending); other types have no canonical kind.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
  ARCHIVED: "archived",
  REMOVED: "deleted",
  CANCELED: "deleted",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

/** Major-units decimal string → minor units. `"100.00"` → `10000`. */
function toMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

/**
 * Normalize a LinkedIn budget object (`{ amount, currencyCode }`) into the
 * canonical `{ amountMinor, currency }` money shape.
 */
function normalizeMoney(budget: unknown): { amountMinor: number; currency: string } | null {
  if (!budget || typeof budget !== "object") return null;
  const b = budget as Record<string, unknown>;
  const amountMinor = toMinor(b.amount);
  if (amountMinor == null) return null;
  const currency = typeof b.currencyCode === "string" ? b.currencyCode : "USD";
  return { amountMinor, currency };
}

/**
 * Normalize a LinkedIn `runSchedule` (`{ start, end }` epoch-millis) into ISO
 * strings. Returns `{ startAt: null, endAt: null }` when absent or non-trivial.
 */
function normalizeSchedule(runSchedule: unknown): { startAt: string | null; endAt: string | null } {
  if (!runSchedule || typeof runSchedule !== "object") {
    return { startAt: null, endAt: null };
  }
  const s = runSchedule as Record<string, unknown>;
  const startAt =
    typeof s.start === "number" && Number.isFinite(s.start)
      ? new Date(s.start).toISOString()
      : null;
  const endAt =
    typeof s.end === "number" && Number.isFinite(s.end) ? new Date(s.end).toISOString() : null;
  return { startAt, endAt };
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot.
 * LinkedIn partial updates have `$set` shallow-replacement semantics, so the
 * patch is a shallow overlay (mirrors the platform's own write semantics).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildLinkedInSnapshot(
  entityType: string,
  entityUrn: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  return {
    schemaVersion: 1,
    platform: "linkedin_ads",
    entityKind,
    platformEntityId: entityUrn,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId: typeof merged.account === "string" ? merged.account : null,
    status: normalizeStatus(merged.status),
    budget: {
      daily: normalizeMoney(merged.dailyBudget),
      lifetime: normalizeMoney(merged.totalBudget),
    },
    schedule: normalizeSchedule(merged.runSchedule),
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureLinkedInSnapshot(
  service: LinkedInServiceLike,
  entityType: string,
  entityUrn: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !service.getEntity) return undefined;
  try {
    const current = (await service.getEntity(entityType, entityUrn, context)) as
      | Record<string, unknown>
      | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildLinkedInSnapshot(entityType, entityUrn, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity returned by the
 * LinkedIn partial update). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (status, name, budgets) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromLinkedInEntity(
  entityType: string,
  entityUrn: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.status == null &&
      entity.name == null &&
      entity.dailyBudget == null &&
      entity.totalBudget == null)
  ) {
    return undefined;
  }
  const snapshot = buildLinkedInSnapshot(entityType, entityUrn, entity, {});
  return snapshot ?? undefined;
}
