// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for TikTok `update_entity`. R3-U4 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R3-U4): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R3-U4): read pre-state at handler start, execute
 *   the POST, normalize the updated entity the POST returns (with a re-read
 *   fallback), normalize both.
 *
 * Governed scope is `campaign`, `adGroup` (ad-group-equivalent) and `ad` — the
 * TikTok entities that carry a `status`. `creative` has no canonical entity
 * kind and falls through.
 *
 * TikTok budget amounts are expressed in the advertiser's currency major
 * units; the canonical snapshot stores minor units, so amounts are ×100.
 * `ad` entities carry no budget — their snapshot budget is `{daily:null,
 * lifetime:null}`.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface TiktokServiceLike {
  // Loosened from `TikTokService.getEntity` (generic over the entity-type
  // union) so the helper accepts arbitrary `entityType` strings.
  getEntity?: (entityType: any, entityId: string, context?: RequestContext) => Promise<unknown>;
}

/**
 * Public `entityType` input → canonical kind. TikTok's `campaign` is the
 * campaign-level object, `adGroup` the ad-group-level object, and `ad` the
 * ad-level object. `creative` is intentionally absent — out of governed scope.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adGroup: "ad_group",
  ad: "ad",
};

/**
 * TikTok read `status` values are platform enums suffixed with the lifecycle
 * verb: `CAMPAIGN_STATUS_ENABLE`, `ADGROUP_STATUS_DISABLE`, `AD_STATUS_DELETE`,
 * etc. Canonicalize by suffix.
 */
function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  let canonical: CanonicalStatus;
  if (platformRaw.endsWith("_ENABLE")) {
    canonical = "active";
  } else if (platformRaw.endsWith("_DISABLE")) {
    canonical = "paused";
  } else if (platformRaw.endsWith("_DELETE")) {
    canonical = "deleted";
  } else {
    canonical = "unknown";
  }
  return { canonical, platformRaw };
}

/** Currency major units → minor units. `123.45` USD → `12345` cents. */
function toMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot. TikTok
 * updates are POST overlays, so the patch is a shallow overlay (mirrors the
 * platform's own write semantics).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildTiktokSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  // `ad` entities carry no budget; `campaign` / `adGroup` carry a flat
  // `budget` number with a sibling `budget_mode`.
  let money: { amountMinor: number; currency: string } | null = null;
  let isDaily = false;
  let isLifetime = false;
  if (entityKind !== "ad") {
    const amountMinor = toMinor(merged.budget);
    money = amountMinor != null ? { amountMinor, currency: "USD" } : null;
    isDaily = merged.budget_mode === "BUDGET_MODE_DAY";
    isLifetime = merged.budget_mode === "BUDGET_MODE_TOTAL";
  }

  const displayName =
    typeof merged.campaign_name === "string"
      ? merged.campaign_name
      : typeof merged.adgroup_name === "string"
        ? merged.adgroup_name
        : typeof merged.ad_name === "string"
          ? merged.ad_name
          : null;

  return {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind,
    platformEntityId: entityId,
    displayName,
    accountId: typeof merged.advertiser_id === "string" ? merged.advertiser_id : null,
    status: normalizeStatus(merged.status),
    budget: {
      daily: isDaily ? money : null,
      lifetime: isLifetime ? money : null,
    },
    schedule: {
      startAt: typeof merged.schedule_start_time === "string" ? merged.schedule_start_time : null,
      endAt: typeof merged.schedule_end_time === "string" ? merged.schedule_end_time : null,
    },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureTiktokSnapshot(
  service: TiktokServiceLike,
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
    const snapshot = buildTiktokSnapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity returned by the
 * TikTok update POST). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (status, name, budget) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromTiktokEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.status == null &&
      entity.campaign_name == null &&
      entity.adgroup_name == null &&
      entity.ad_name == null &&
      entity.budget == null)
  ) {
    return undefined;
  }
  const snapshot = buildTiktokSnapshot(entityType, entityId, entity, {});
  return snapshot ?? undefined;
}
