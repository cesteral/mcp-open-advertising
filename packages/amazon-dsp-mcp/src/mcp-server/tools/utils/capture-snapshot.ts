// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for Amazon DSP `update_entity` / `create_entity` /
 * `duplicate_entity`. R2-U4 wiring, Unified API shapes since #234.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run: read the current entity, shallow-merge the patch
 *   (already translated to Unified shape), normalize.
 * - Real-write before/after: read pre-state at handler start, execute the
 *   update, normalize the entity the 207 multi-status returns (with a re-read
 *   fallback).
 *
 * Governed scope is `order` (Unified campaign) and `lineItem` (Unified ad
 * group) — the entities carrying a `state` and budgets. `creative` / `target`
 * / `creativeAssociation` have no canonical entity kind and fall through.
 *
 * Budgets (basis: unified-api-dsp.json `DSPBudget`, `DSPMonetaryBudget`,
 * amzn/ads-advanced-tools-docs @ e25aace0): `budgets[]` of
 * `{ budgetType: "MONETARY", budgetValue: { monetaryBudgetValue: {
 * monetaryBudget: { value, currencyCode } } }, recurrenceTimePeriod }` —
 * DAILY → canonical daily, LIFETIME → canonical lifetime (MONTHLY has no
 * canonical slot). Amounts are advertiser-currency major units; the canonical
 * snapshot stores minor units, so amounts are ×100. `currencyCode` is
 * read-only (absent on create payloads); when no budget or bid carries one the
 * snapshot falls back to "USD", as before #234.
 *
 * Schedule: a campaign's dates come from its `flights[]` (min start / max end)
 * when present — `DSPCampaign.startDateTime` / `endDateTime` are read-only
 * aggregates and absent from create payloads; ad groups carry top-level dates.
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
  getEntity?: (
    entityType: any,
    accountId: string,
    entityId: string,
    context?: RequestContext
  ) => Promise<unknown>;
}

/**
 * `entityType` input → canonical kind. An Amazon DSP `order` is the Unified
 * campaign and a `lineItem` the Unified ad group.
 */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  order: "order",
  lineItem: "line_item",
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

function monetaryBudget(budget: unknown): { value?: unknown; currencyCode?: unknown } {
  return ((budget as any)?.budgetValue?.monetaryBudgetValue?.monetaryBudget ?? {}) as {
    value?: unknown;
    currencyCode?: unknown;
  };
}

/**
 * The advertiser currency an entity states anywhere Amazon returns one (a
 * budget, a flight budget, an ad group bid). A patch's budgets carry only
 * `value` (create/update schemas), so the current entity's currency is used.
 */
function entityCurrency(entity: Record<string, any>): string | undefined {
  const candidates: unknown[] = [];
  if (Array.isArray(entity.budgets)) {
    for (const b of entity.budgets) candidates.push(monetaryBudget(b).currencyCode);
  }
  if (Array.isArray(entity.flights)) {
    for (const f of entity.flights) candidates.push(monetaryBudget(f?.budget).currencyCode);
  }
  candidates.push(entity.bid?.currencyCode);
  return candidates.find((c): c is string => typeof c === "string" && c.length > 0);
}

function flightBounds(flights: unknown): { start: string | null; end: string | null } | null {
  if (!Array.isArray(flights) || flights.length === 0) return null;
  const starts = flights
    .map((f) => (f as any)?.startDateTime)
    .filter((v): v is string => typeof v === "string")
    .sort();
  const ends = flights
    .map((f) => (f as any)?.endDateTime)
    .filter((v): v is string => typeof v === "string")
    .sort();
  return { start: starts[0] ?? null, end: ends[ends.length - 1] ?? null };
}

/**
 * Pure builder: combine `current` + `patch` into a canonical snapshot. The
 * patch is a shallow overlay (a Unified update replaces each field it sends).
 *
 * Used by both the dry-run symbolic apply (patch = requested mutation in
 * Unified shape) and the real-write `after` capture (patch = `{}`, current =
 * post-write entity). `accountId` is the Amazon-Ads-AccountId the call ran
 * under — Unified entities carry no advertiser field.
 */
export function buildAmazonDspSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  accountId: string | null = null
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  let daily: { amountMinor: number; currency: string } | null = null;
  let lifetime: { amountMinor: number; currency: string } | null = null;
  const fallbackCurrency = entityCurrency(current) ?? entityCurrency(merged) ?? "USD";
  if (Array.isArray(merged.budgets)) {
    for (const b of merged.budgets) {
      const mb = monetaryBudget(b);
      const amountMinor = toMinor(mb.value);
      if (amountMinor == null) continue;
      const money = {
        amountMinor,
        currency: typeof mb.currencyCode === "string" ? mb.currencyCode : fallbackCurrency,
      };
      const recurrence = (b as any)?.recurrenceTimePeriod;
      if (recurrence === "DAILY" && daily == null) daily = money;
      else if (recurrence === "LIFETIME" && lifetime == null) lifetime = money;
    }
  }

  const flights = entityKind === "order" ? flightBounds(merged.flights) : null;
  const startAt =
    flights?.start ?? (typeof merged.startDateTime === "string" ? merged.startDateTime : null);
  const endAt =
    flights?.end ?? (typeof merged.endDateTime === "string" ? merged.endDateTime : null);

  return {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof merged.name === "string" ? merged.name : null,
    accountId,
    status: normalizeStatus(merged.state),
    budget: { daily, lifetime },
    schedule: { startAt, endAt },
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
  accountId: string,
  entityId: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !service.getEntity) return undefined;
  try {
    const current = (await service.getEntity(entityType, accountId, entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildAmazonDspSnapshot(entityType, entityId, current, {}, accountId);
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalize an entity object already in hand (e.g. the entity a 207
 * multi-status returns). No I/O.
 *
 * Returns undefined when the object carries none of the fields the canonical
 * snapshot surfaces (state, name, budgets) — callers should fall back to a
 * re-read rather than emit a snapshot derived from absent data.
 */
export function snapshotFromAmazonDspEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>,
  accountId: string | null = null
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (!entity || (entity.state == null && entity.name == null && entity.budgets == null)) {
    return undefined;
  }
  const snapshot = buildAmazonDspSnapshot(entityType, entityId, entity, {}, accountId);
  return snapshot ?? undefined;
}
