// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for Amazon DSP `update_entity`. R2-U4 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R2-U4): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R2-U4): read pre-state at handler start, execute
 *   the PUT, normalize the updated entity the PUT returns (with a re-read
 *   fallback), normalize both.
 *
 * Governed scope is `order` (campaign-equivalent) and `lineItem`
 * (ad-group-equivalent) — the Amazon DSP entities that carry a `state` and a
 * budget. `creative` / `target` / `creativeAssociation` have no canonical
 * entity kind and fall through.
 *
 * Amazon DSP budget amounts are expressed in the advertiser's currency major
 * units; the canonical snapshot stores minor units, so amounts are ×100.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface AmazonDspServiceLike {
  // Loosened from `AmazonDspService.getEntity` (generic over the entity-type
  // union) so the helper accepts arbitrary `entityType` strings.
  getEntity?: (entityType: any, entityId: string, context?: RequestContext) => Promise<unknown>;
}

/**
 * Public `entityType` input (including the `campaign` / `adGroup` aliases) →
 * canonical kind. Amazon DSP's `order` is the campaign-level object and
 * `lineItem` the ad-group-level object.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  order: "order",
  campaign: "order",
  lineItem: "line_item",
  adGroup: "line_item",
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ENABLED: "active",
  PAUSED: "paused",
  ARCHIVED: "archived",
};

function normalizeStatus(raw: unknown): { canonical: CanonicalStatus; platformRaw: string } {
  const platformRaw = typeof raw === "string" ? raw : "";
  return { canonical: STATUS_MAP[platformRaw] ?? "unknown", platformRaw };
}

/** Currency major units → minor units. `12345.67` USD → `1234567` cents. */
function toMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = typeof amount === "string" ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot. Amazon
 * DSP updates are full-field PUT replacements, so the patch is a shallow
 * overlay (mirrors the platform's own write semantics).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildAmazonDspSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  // Budget shape differs by entity: `order` carries a flat `budget` number
  // with a sibling `budgetType`; `lineItem` carries a nested
  // `budget: { budgetType, budget }` object.
  let amount: unknown;
  let budgetType: unknown;
  let currency = "USD";
  if (entityKind === "order") {
    amount = merged.budget;
    budgetType = merged.budgetType;
    if (typeof merged.currencyCode === "string") currency = merged.currencyCode;
  } else {
    const nested = merged.budget as Record<string, unknown> | undefined;
    amount = nested?.budget;
    budgetType = nested?.budgetType;
  }
  const amountMinor = toMinor(amount);
  const money = amountMinor != null ? { amountMinor, currency } : null;
  const isDaily = budgetType === "DAILY";
  const isLifetime = budgetType === "LIFETIME";

  return {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId: typeof merged.advertiserId === "string" ? merged.advertiserId : null,
    status: normalizeStatus(merged.state),
    budget: {
      daily: isDaily ? money : null,
      lifetime: isLifetime ? money : null,
    },
    schedule: {
      startAt: typeof merged.startDateTime === "string" ? merged.startDateTime : null,
      endAt: typeof merged.endDateTime === "string" ? merged.endDateTime : null,
    },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureAmazonDspSnapshot(
  service: AmazonDspServiceLike,
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
    const snapshot = buildAmazonDspSnapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity returned by the
 * Amazon DSP PUT). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (state, name, budget) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromAmazonDspEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (!entity || (entity.state == null && entity.name == null && entity.budget == null)) {
    return undefined;
  }
  const snapshot = buildAmazonDspSnapshot(entityType, entityId, entity, {});
  return snapshot ?? undefined;
}
