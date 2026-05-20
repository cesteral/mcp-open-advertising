// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapshot capture helpers for Google Ads `update_entity`. R2-U3 wiring.
 *
 * The same read-and-normalize logic is reused for:
 * - Symbolic dry-run (R2-U3): read the current entity, overlay the masked
 *   patch fields, normalize.
 * - Real-write before/after (R2-U3): read pre-state at handler start, execute
 *   the :mutate write, re-read post-state (the Google Ads :mutate endpoint
 *   returns only a `resourceName`, never the patched resource), normalize both.
 *
 * The canonical shape covers status and budget. Budget only exists on the
 * `campaignBudget` entity (`amountMicros`); `campaign` / `adGroup` carry no
 * budget field, so their snapshot leaves `budget` null. Entity types outside
 * the governed scope (campaign / adGroup / campaignBudget) fall through.
 */

import type {
  CanonicalEntityKind,
  CanonicalStatus,
  NormalizedEntitySnapshot,
  RequestContext,
} from "@cesteral/shared";

export interface GAdsServiceLike {
  // Loosened from `GAdsService.getEntity` (typed against `GAdsEntityType`) so
  // the helper accepts arbitrary `entityType` strings without leaking the
  // platform-specific union.
  getEntity?: (
    entityType: any,
    customerId: string,
    entityId: string,
    context?: RequestContext
  ) => Promise<unknown>;
}

/** Governed entity types → canonical kind. Keyed by the MCP `entityType` input. */
export const ENTITY_KIND_MAP: Record<string, CanonicalEntityKind> = {
  campaign: "campaign",
  adGroup: "ad_group",
  campaignBudget: "campaign_budget",
};

/**
 * Keys the Google Ads `googleAds:search` response nests resource fields under,
 * per entity type. The live REST API uses camelCase; the snake_case variants
 * are tolerated so a row shaped by either convention un-nests cleanly.
 */
const ROW_KEYS: Record<string, string[]> = {
  campaign: ["campaign"],
  adGroup: ["adGroup", "ad_group"],
  campaignBudget: ["campaignBudget", "campaign_budget"],
};

const STATUS_MAP: Record<string, CanonicalStatus> = {
  ENABLED: "active",
  PAUSED: "paused",
  // Google Ads `REMOVED` is permanent — there is no un-remove. Canonical
  // `deleted` rather than `archived`.
  REMOVED: "deleted",
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
 * Un-nest the resource object from a `googleAds:search` result row. The row
 * nests the entity under a resource key (`{ campaign: {...} }`); a row that is
 * already the flat resource (e.g. a testkit fixture) is returned unchanged.
 */
export function unwrapResource(
  entityType: string,
  row: Record<string, unknown>
): Record<string, unknown> | undefined {
  for (const key of ROW_KEYS[entityType] ?? []) {
    const nested = row[key];
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  }
  return row;
}

/**
 * Pure builder: normalize a flat Google Ads resource object into the canonical
 * snapshot. `resource` is the un-nested entity (post-overlay for dry-run, or
 * the post-write read for `after`).
 */
export function buildGAdsSnapshot(
  entityType: string,
  customerId: string,
  entityId: string,
  resource: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const r = resource as Record<string, any>;
  // Google Ads amounts are micros in the account currency, which is not
  // carried on the entity row. Round-1 canonical shape defaults to USD.
  const currency = "USD";

  // Budget lives only on the campaignBudget entity (`amountMicros`, a daily
  // budget). campaign / adGroup rows carry no budget field.
  const dailyMinor =
    entityKind === "campaign_budget" ? microsToMinor(r.amountMicros ?? r.amount_micros) : undefined;

  const startAt = r.startDate ?? r.start_date;
  const endAt = r.endDate ?? r.end_date;

  return {
    schemaVersion: 1,
    platform: "google_ads",
    entityKind,
    platformEntityId: entityId,
    displayName: typeof r.name === "string" ? r.name : null,
    accountId: customerId || null,
    status: normalizeStatus(r.status),
    budget: {
      daily: dailyMinor != null ? { amountMinor: dailyMinor, currency } : null,
      lifetime: null,
    },
    schedule: {
      startAt: typeof startAt === "string" ? startAt : null,
      endAt: typeof endAt === "string" ? endAt : null,
    },
  };
}

/**
 * Read the entity through the service layer and normalize. Returns `undefined`
 * if the entity type is out of governed scope or the read fails — callers
 * leave the corresponding `before` / `after` field undefined rather than
 * throwing.
 */
export async function captureGAdsSnapshot(
  gadsService: GAdsServiceLike,
  entityType: string,
  customerId: string,
  entityId: string,
  context: RequestContext
): Promise<NormalizedEntitySnapshot | undefined> {
  if (!ENTITY_KIND_MAP[entityType] || !gadsService.getEntity) return undefined;
  try {
    const row = (await gadsService.getEntity(entityType, customerId, entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (!row || typeof row !== "object") return undefined;
    const resource = unwrapResource(entityType, row);
    if (!resource) return undefined;
    const snapshot = buildGAdsSnapshot(entityType, customerId, entityId, resource);
    return snapshot ?? undefined;
  } catch {
    return undefined;
  }
}
