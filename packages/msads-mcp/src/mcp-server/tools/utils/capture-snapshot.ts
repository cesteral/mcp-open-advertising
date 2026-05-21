// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for Microsoft Ads `msads_update_entity`. R4-U5 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R4-U5): read the current entity, shallow-merge the
 *   patch, normalize.
 * - Real-write before/after (R4-U5): read pre-state at handler start, execute
 *   the PUT, normalize the updated entity (re-read fallback), normalize both.
 *
 * Governed scope is `campaign`, `adGroup`, `ad`, and `budget` — the Microsoft
 * Ads entities that carry a canonical status and/or budget. `keyword`,
 * `adExtension`, `audience`, and `label` have no canonical entity kind and
 * fall through.
 *
 * Microsoft Ads' shared `budget` entity carries an `Amount` in the account's
 * currency major units; the canonical snapshot stores minor units, so amounts
 * are ×100. `campaign` carries an inline `DailyBudget` / `MonthlyBudget`;
 * `adGroup` and `ad` carry no budget field.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  MoneyAmount,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface MsAdsServiceLike {
  // Loosened from `MsAdsService.getEntity` (generic over the entity-type
  // union) so the helper accepts arbitrary `entityType` strings.
  getEntity?: (
    entityType: any,
    entityIds: string[],
    params?: Record<string, unknown>,
    context?: RequestContext
  ) => Promise<{ entities: unknown[] }>;
}

/**
 * Public `entityType` input → canonical kind. Microsoft Ads' `budget` is the
 * shared/campaign-budget object (the analogue of Google Ads' `campaignBudget`).
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adGroup: "ad_group",
  ad: "ad",
  budget: "campaign_budget",
};

/**
 * Microsoft Ads status → canonical status. MS Ads has no `archived` concept;
 * the budget-throttled and suspended campaign states all collapse to `paused`,
 * and `Expired` (an ad group whose end date has passed) is a time-based pause.
 * The shared `budget` entity carries no status field at all.
 */
const STATUS_MAP: Record<string, CanonicalStatus> = {
  Active: "active",
  Paused: "paused",
  BudgetPaused: "paused",
  BudgetAndManualPaused: "paused",
  Suspended: "paused",
  Expired: "paused",
  Inactive: "paused",
  Deleted: "deleted",
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

/**
 * Microsoft Ads `Date` objects are `{ Day, Month, Year }`. Convert to an
 * ISO-8601 date string; return null when the shape is incomplete.
 */
function dateToIso(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const year = Number(d.Year);
  const month = Number(d.Month);
  const day = Number(d.Day);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot.
 * Microsoft Ads updates are partial-field PUTs, so the patch is a shallow
 * overlay (mirrors the platform's own write semantics).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation) and the
 * real-write `after` capture (patch = `{}`, current = post-write entity).
 */
export function buildMsAdsSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  // Budget shape differs by entity:
  // - `budget` (campaign_budget): a flat `Amount` with a sibling `BudgetType`
  //   (DailyBudget* → daily, MonthlyBudget* → lifetime).
  // - `campaign`: inline `DailyBudget` / `MonthlyBudget` numbers with a
  //   `BudgetType` discriminator.
  // - `adGroup` / `ad`: no budget field → null.
  let daily: MoneyAmount | null = null;
  let lifetime: MoneyAmount | null = null;
  const currency = "USD";

  if (entityKind === "campaign_budget") {
    const amountMinor = toMinor(merged.Amount);
    if (amountMinor != null) {
      const money: MoneyAmount = { amountMinor, currency };
      if (merged.BudgetType === "MonthlyBudgetSpendUntilDepleted") {
        lifetime = money;
      } else {
        daily = money;
      }
    }
  } else if (entityKind === "campaign") {
    const dailyMinor = toMinor(merged.DailyBudget);
    const monthlyMinor = toMinor(merged.MonthlyBudget);
    if (dailyMinor != null) daily = { amountMinor: dailyMinor, currency };
    if (monthlyMinor != null) lifetime = { amountMinor: monthlyMinor, currency };
  }

  return {
    schemaVersion: 1,
    platform: "msads",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.Name === "string" ? merged.Name : null,
    accountId: merged.AccountId != null ? String(merged.AccountId) : null,
    status: normalizeStatus(merged.Status),
    budget: { daily, lifetime },
    schedule: {
      startAt: dateToIso(merged.StartDate),
      endAt: dateToIso(merged.EndDate),
    },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureMsAdsSnapshot(
  service: MsAdsServiceLike,
  entityType: string,
  entityId: string,
  params: Record<string, unknown>,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !service.getEntity) return undefined;
  try {
    const { entities } = await service.getEntity(entityType, [entityId], params, context);
    const current = entities?.[0] as Record<string, unknown> | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildMsAdsSnapshot(entityType, entityId, current, {});
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. an item from the patch the
 * caller submitted, merged onto a pre-read). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (Status, Name, budget) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromMsAdsEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.Status == null &&
      entity.Name == null &&
      entity.Amount == null &&
      entity.DailyBudget == null &&
      entity.MonthlyBudget == null)
  ) {
    return undefined;
  }
  const snapshot = buildMsAdsSnapshot(entityType, entityId, entity, {});
  return snapshot ?? undefined;
}
