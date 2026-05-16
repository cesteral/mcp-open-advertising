// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for DV360 `update_entity`. PR-D wiring.
 *
 * Extracted from `dry-run.ts` so the same read-and-normalize logic is reused
 * for:
 * - Symbolic dry-run (PR-C): read current entity, overlay updateMask fields,
 *   normalize.
 * - Real-write before/after (PR-D): read pre-state at handler start, execute
 *   the write, normalize the patched resource that DV360 returns.
 *
 * The canonical shape covers status, budget segments (micros → minor units),
 * and basic flight schedule. Other DV360 entity types (creatives, ad groups)
 * fall outside round 1.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface Dv360ServiceLike {
  getEntity?: (
    entityType: string,
    ids: Record<string, string>,
    context?: RequestContext
  ) => Promise<unknown>;
}

export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  insertionOrder: "insertion_order",
  lineItem: "line_item",
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ENTITY_STATUS_ACTIVE: "active",
  ENTITY_STATUS_PAUSED: "paused",
  ENTITY_STATUS_ARCHIVED: "archived",
  ENTITY_STATUS_DELETED: "deleted",
  ENTITY_STATUS_DRAFT: "unknown",
  ENTITY_STATUS_SCHEDULED_FOR_DELETION: "deleted",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

function microsToMinor(micros: unknown): number | undefined {
  if (micros == null) return undefined;
  const n = typeof micros === "string" ? Number(micros) : Number(micros);
  if (!Number.isFinite(n)) return undefined;
  // micros → minor units (cents). 1,000,000 micros = $1.00 = 100 cents.
  return Math.round(n / 10000);
}

/**
 * Pure builder. `applied` is the entity post-overlay (or post-write); `current`
 * is only used for status fallback when `applied.entityStatus` is missing.
 */
export function buildDv360Snapshot(
  entityType: string,
  ids: Record<string, string>,
  current: Record<string, unknown>,
  applied: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const platformEntityId =
    ids.lineItemId ?? ids.insertionOrderId ?? ids.campaignId ?? ids.advertiserId ?? "";

  const merged = applied as Record<string, any>;
  // currency isn't carried on the entity directly; advertiser scope. Default to USD for round-1.
  const currency = "USD";

  const segments: Array<{
    amountMinor: number;
    currency: string;
    startAt: string | null;
    endAt: string | null;
  }> = [];
  const segArr = merged?.budget?.budgetSegments;
  if (Array.isArray(segArr)) {
    for (const seg of segArr) {
      const amountMinor = microsToMinor(seg?.budgetAmountMicros);
      if (amountMinor == null) continue;
      const start = seg?.dateRange?.startDate;
      const end = seg?.dateRange?.endDate;
      const startAt = start
        ? `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`
        : null;
      const endAt = end
        ? `${end.year}-${String(end.month).padStart(2, "0")}-${String(end.day).padStart(2, "0")}`
        : null;
      segments.push({ amountMinor, currency, startAt, endAt });
    }
  }
  const lifetimeMinor = segments.reduce((sum, s) => sum + s.amountMinor, 0);

  const flightStart = merged?.flight?.dateRange?.startDate;
  const flightEnd = merged?.flight?.dateRange?.endDate;

  return {
    schemaVersion: 1,
    platform: "dv360",
    entityKind,
    platformEntityId,
    displayName: typeof merged.displayName === "string" ? merged.displayName : null,
    accountId: typeof ids.advertiserId === "string" ? ids.advertiserId : null,
    status: normalizeStatus(merged.entityStatus ?? (current as any).entityStatus),
    budget: {
      daily: null,
      lifetime: lifetimeMinor > 0 ? { amountMinor: lifetimeMinor, currency } : null,
      segments: segments.length > 0 ? segments : null,
    },
    schedule: {
      startAt: flightStart
        ? `${flightStart.year}-${String(flightStart.month).padStart(2, "0")}-${String(flightStart.day).padStart(2, "0")}`
        : null,
      endAt: flightEnd
        ? `${flightEnd.year}-${String(flightEnd.month).padStart(2, "0")}-${String(flightEnd.day).padStart(2, "0")}`
        : null,
    },
  };
}

/**
 * Read the entity through the service-layer abstraction and normalize.
 * Returns `undefined` if the entity type is not in the canonical scope or
 * the read fails.
 */
export async function captureDv360Snapshot(
  dv360Service: Dv360ServiceLike,
  entityType: string,
  ids: Record<string, string>,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !dv360Service.getEntity) return undefined;
  try {
    const current = (await dv360Service.getEntity(entityType, ids, context)) as Record<
      string,
      unknown
    >;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildDv360Snapshot(entityType, ids, current, current);
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object that's already in hand (e.g. the patched resource
 * returned by the DV360 PATCH call). No I/O.
 *
 * Returns undefined when the object lacks every field the canonical snapshot
 * would surface (status, displayName, budget). DV360 PATCH normally returns
 * the patched resource in full, but if the SDK shape is unexpected (e.g. an
 * empty `{}` or a wrapped envelope), callers should fall back to a re-read
 * rather than emit a snapshot with `status: unknown` derived from absent data.
 */
export function snapshotFromDv360Entity(
  entityType: string,
  ids: Record<string, string>,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.entityStatus == null && entity.displayName == null && entity.budget == null)
  ) {
    return undefined;
  }
  const snapshot = buildDv360Snapshot(entityType, ids, entity, entity);
  return snapshot ?? undefined;
}
