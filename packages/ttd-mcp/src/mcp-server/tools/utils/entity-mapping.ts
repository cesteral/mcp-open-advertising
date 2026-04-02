// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Entity Mapping
 *
 * Static configuration for TTD entity types.
 * TTD API is more regular than DV360 — no dynamic introspection needed.
 *
 * Covers the entity types currently exposed as first-class MCP CRUD tools:
 * advertiser, campaign, adGroup, creative, and conversionTracker.
 *
 * Other TTD objects such as ads, deals, bid lists, and site lists are not
 * exposed here as CRUD entities. Use GraphQL or the Workflows REST passthrough
 * for endpoints that are outside this first-class entity set.
 */

export type TtdEntityType =
  | "advertiser"
  | "campaign"
  | "adGroup"
  | "creative"
  | "conversionTracker";

/** Subset that supports bulk create/update via the Workflows Service. */
export type BulkSupportedEntityType = "campaign" | "adGroup";

export interface TtdEntityConfig {
  apiPath: string;
  /** TTD query endpoint path (e.g., "/campaign/query/advertiser"). */
  queryPath: string;
  parentIds: ParentIdKey[];
  idField: string;
  /** Whether the entity supports bulk create/update via Workflows Service. */
  supportsBulk?: boolean;
  /** Whether the entity can be archived (soft-deleted). */
  supportsArchive?: boolean;
}

export type ParentIdKey = "advertiserId" | "campaignId" | "adGroupId" | "partnerId";

const ENTITY_CONFIGS: Record<TtdEntityType, TtdEntityConfig> = {
  advertiser: {
    apiPath: "/advertiser",
    queryPath: "/advertiser/query/partner",
    parentIds: [],
    idField: "AdvertiserId",
  },
  campaign: {
    apiPath: "/campaign",
    queryPath: "/campaign/query/advertiser",
    parentIds: ["advertiserId"],
    idField: "CampaignId",
    supportsBulk: true,
    supportsArchive: true,
  },
  adGroup: {
    apiPath: "/adgroup",
    queryPath: "/adgroup/query/campaign",
    parentIds: ["advertiserId", "campaignId"],
    idField: "AdGroupId",
    supportsBulk: true,
    supportsArchive: true,
  },
  creative: {
    apiPath: "/creative",
    queryPath: "/creative/query/advertiser",
    parentIds: ["advertiserId"],
    idField: "CreativeId",
  },
  conversionTracker: {
    apiPath: "/trackingtag",
    queryPath: "/trackingtag/query/advertiser",
    parentIds: ["advertiserId"],
    idField: "TrackingTagId",
  },
};

export function getEntityConfig(entityType: TtdEntityType): TtdEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown TTD entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): TtdEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as TtdEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

export function getBulkSupportedEntityTypes(): BulkSupportedEntityType[] {
  return (Object.entries(ENTITY_CONFIGS) as [TtdEntityType, TtdEntityConfig][])
    .filter(([, config]) => config.supportsBulk)
    .map(([type]) => type) as BulkSupportedEntityType[];
}

export function getBulkEntityTypeEnum(): [string, ...string[]] {
  const types = getBulkSupportedEntityTypes();
  return types as [string, ...string[]];
}

export function getArchiveSupportedEntityTypes(): TtdEntityType[] {
  return (Object.entries(ENTITY_CONFIGS) as [TtdEntityType, TtdEntityConfig][])
    .filter(([, config]) => config.supportsArchive)
    .map(([type]) => type);
}
