// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { CanonicalStatus, NormalizedEntitySnapshot, RequestContext } from "@cesteral/shared";
import { ENTITY_KIND_MAP } from "./capture-snapshot.js";
import { getSmartPlusEntityConfig, type SmartPlusEntityType } from "./smart-plus-mapping.js";

/**
 * Canonical snapshots for Upgraded Smart+ entities.
 *
 * The legacy builder (`capture-snapshot.ts`) reads `status` with a
 * `CAMPAIGN_STATUS_ENABLE`-style suffix. The Smart+ create / get responses carry
 * `operation_status` (`ENABLE` / `DISABLE` / `DELETE`; ads also `FROZEN`, "the ad
 * is terminated and cannot be enabled"), and a Smart+ campaign's default budget
 * mode is `BUDGET_MODE_DYNAMIC_DAILY_BUDGET` (an average daily budget), which the
 * legacy builder would not count as a daily budget.
 */

function normalizeSmartPlusStatus(raw: unknown): {
  canonical: CanonicalStatus;
  platformRaw: string;
} {
  const platformRaw = typeof raw === "string" ? raw : "";
  let canonical: CanonicalStatus = "unknown";
  if (platformRaw === "ENABLE") canonical = "active";
  else if (platformRaw === "DISABLE") canonical = "paused";
  else if (platformRaw === "DELETE") canonical = "deleted";
  return { canonical, platformRaw };
}

function toMinor(amount: unknown): number | undefined {
  if (amount == null) return undefined;
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

/** Pure builder: `current` overlaid with `patch`, normalized. */
export function buildSmartPlusSnapshot(
  entityType: string,
  entityId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): NormalizedEntitySnapshot | null {
  const entityKind = ENTITY_KIND_MAP[entityType];
  if (!entityKind) return null;

  const merged = { ...current, ...patch } as Record<string, any>;

  let money: { amountMinor: number; currency: string } | null = null;
  let isDaily = false;
  let isLifetime = false;
  if (entityKind !== "ad") {
    const amountMinor = toMinor(merged.budget);
    money = amountMinor != null ? { amountMinor, currency: "USD" } : null;
    isDaily =
      merged.budget_mode === "BUDGET_MODE_DAY" ||
      merged.budget_mode === "BUDGET_MODE_DYNAMIC_DAILY_BUDGET";
    isLifetime = merged.budget_mode === "BUDGET_MODE_TOTAL";
  }

  const displayName =
    typeof merged.campaign_name === "string" && entityKind === "campaign"
      ? merged.campaign_name
      : typeof merged.adgroup_name === "string" && entityKind === "ad_group"
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
    status: normalizeSmartPlusStatus(merged.operation_status),
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

/** Normalize an entity already in hand (a create / update response). No I/O. */
export function smartPlusSnapshotFromEntity(
  entityType: string,
  entityId: string,
  entity: Record<string, unknown>
): NormalizedEntitySnapshot | undefined {
  if (!ENTITY_KIND_MAP[entityType]) return undefined;
  if (
    !entity ||
    (entity.operation_status == null &&
      entity.campaign_name == null &&
      entity.adgroup_name == null &&
      entity.ad_name == null &&
      entity.budget == null)
  ) {
    return undefined;
  }
  return buildSmartPlusSnapshot(entityType, entityId, entity, {}) ?? undefined;
}

export interface SmartPlusServiceLike {
  getSmartPlusEntity?: (
    entityType: SmartPlusEntityType,
    entityId: string,
    context?: RequestContext
  ) => Promise<unknown>;
}

/** Read through the Smart+ get endpoint and normalize; undefined when the read fails. */
export async function captureSmartPlusEntity(
  service: SmartPlusServiceLike,
  entityType: SmartPlusEntityType,
  entityId: string,
  context: RequestContext
): Promise<{ entity: Record<string, unknown>; snapshot?: NormalizedEntitySnapshot } | undefined> {
  if (!service.getSmartPlusEntity) return undefined;
  try {
    const current = (await service.getSmartPlusEntity(entityType, entityId, context)) as
      | Record<string, unknown>
      | undefined;
    if (!current || typeof current !== "object") return undefined;
    const snapshot = buildSmartPlusSnapshot(entityType, entityId, current, {});
    return { entity: current, ...(snapshot ? { snapshot } : {}) };
  } catch {
    return undefined;
  }
}

/** The id a Smart+ create / get response carries for this entity type. */
export function smartPlusIdOf(
  entityType: SmartPlusEntityType,
  entity: Record<string, unknown>
): string {
  const id = entity[getSmartPlusEntityConfig(entityType).idField];
  return id == null ? "" : String(id);
}
