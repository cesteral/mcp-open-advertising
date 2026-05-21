// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for CM360 `cm360_update_entity`. R4-U2 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R4-U2): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R4-U2): read pre-state at handler start, execute
 *   the PUT, normalize the updated entity the PUT returns (with a re-read
 *   fallback), normalize both.
 *
 * Governed scope is `campaign` and `ad` — the CM360 entities that carry a
 * canonical status. CM360 `placement` is intentionally out of scope (a
 * governance taxonomy decision is pending); `advertiser` / `creative` /
 * `site` / `floodlight*` have no canonical entity kind and also fall through.
 *
 * CM360 campaigns and ads carry NO budget field on the resource — budget in
 * CM360 lives in the planning surface, not on the entity. Both snapshots
 * therefore report `budget: { daily: null, lifetime: null }`.
 *
 * Status:
 * - `campaign` exposes only an `archived` boolean — `archived` → `archived`,
 *   otherwise `active`. There is no platform-native paused state.
 * - `ad` exposes `active` + `archived` booleans — `archived` → `archived`,
 *   else `active === false` → `paused`, `active === true` → `active`.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
  StatusSnapshot,
} from "@cesteral/shared";

export interface Cm360ServiceLike {
  // Loosened from `CM360Service.getEntity` (generic over the entity-type
  // union) so the helper accepts arbitrary `entityType` strings.
  getEntity?: (
    entityType: any,
    profileId: string,
    entityId: string,
    context?: RequestContext
  ) => Promise<unknown>;
}

/**
 * Public `entityType` input → canonical kind. Keyed by the MCP `entityType`
 * value. CM360's `campaign` is the campaign-level object and `ad` the
 * ad-level object.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  ad: "ad",
};

/**
 * Normalize a CM360 entity's status booleans into a canonical
 * {@link StatusSnapshot}. The `platformRaw` string preserves the underlying
 * boolean field values so consumers never lose audit fidelity.
 */
function normalizeStatus(
  entityKind: CanonicalEntityKind,
  entity: Record<string, unknown>
): StatusSnapshot {
  const archived = entity.archived === true;
  if (entityKind === "campaign") {
    const canonical: CanonicalStatus = archived ? "archived" : "active";
    return { canonical, platformRaw: `archived=${archived}` };
  }
  // `ad`: archived wins, otherwise the `active` boolean drives paused/active.
  const active = entity.active;
  let canonical: CanonicalStatus;
  if (archived) {
    canonical = "archived";
  } else if (active === false) {
    canonical = "paused";
  } else if (active === true) {
    canonical = "active";
  } else {
    canonical = "unknown";
  }
  return { canonical, platformRaw: `active=${String(active)},archived=${archived}` };
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot. CM360
 * updates are full-object PUT replacements, so the patch is a shallow overlay
 * (mirrors the platform's own write semantics).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildCm360Snapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  // Schedule field names differ by entity: `campaign` carries `startDate` /
  // `endDate` (date), `ad` carries `startTime` / `endTime` (date-time).
  const startAt =
    entityKind === "campaign"
      ? typeof merged.startDate === "string"
        ? merged.startDate
        : null
      : typeof merged.startTime === "string"
        ? merged.startTime
        : null;
  const endAt =
    entityKind === "campaign"
      ? typeof merged.endDate === "string"
        ? merged.endDate
        : null
      : typeof merged.endTime === "string"
        ? merged.endTime
        : null;

  return {
    schemaVersion: 1,
    platform: "cm360",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId: typeof merged.accountId === "string" ? merged.accountId : null,
    status: normalizeStatus(entityKind, merged),
    // CM360 campaigns and ads carry no budget on the resource itself.
    budget: { daily: null, lifetime: null },
    schedule: { startAt, endAt },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureCm360Snapshot(
  service: Cm360ServiceLike,
  entityType: string,
  profileId: string,
  entityId: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !service.getEntity) return undefined;
  try {
    const current = (await service.getEntity(entityType, profileId, entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildCm360Snapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity returned by the
 * CM360 PUT). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (name, archived, active) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromCm360Entity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (!entity || (entity.name == null && entity.archived == null && entity.active == null)) {
    return undefined;
  }
  const snapshot = buildCm360Snapshot(entityType, entityId, entity, {});
  return snapshot ?? undefined;
}
