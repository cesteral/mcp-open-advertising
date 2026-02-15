/**
 * TTD Entity Mapping
 *
 * Static configuration for TTD entity types.
 * TTD API is more regular than DV360 — no dynamic introspection needed.
 *
 * Covers the core campaign hierarchy (advertiser → campaign → adGroup → ad)
 * plus ancillary entities: creative, siteList, deal, conversionTracker, bidList.
 */

export type TtdEntityType =
  | "advertiser"
  | "campaign"
  | "adGroup"
  | "ad"
  | "creative"
  | "siteList"
  | "deal"
  | "conversionTracker"
  | "bidList";

/** Subset that supports bulk create/update via the Workflows Service. */
export type BulkSupportedEntityType = "campaign" | "adGroup";

export interface TtdEntityConfig {
  apiPath: string;
  parentIds: ParentIdKey[];
  idField: string;
  /** Whether the entity supports bulk create/update via Workflows Service. */
  supportsBulk?: boolean;
  /** Whether the entity can be archived (soft-deleted). */
  supportsArchive?: boolean;
}

export type ParentIdKey = "advertiserId" | "campaignId" | "adGroupId";

const ENTITY_CONFIGS: Record<TtdEntityType, TtdEntityConfig> = {
  advertiser: {
    apiPath: "/advertiser",
    parentIds: [],
    idField: "AdvertiserId",
  },
  campaign: {
    apiPath: "/campaign",
    parentIds: ["advertiserId"],
    idField: "CampaignId",
    supportsBulk: true,
    supportsArchive: true,
  },
  adGroup: {
    apiPath: "/adgroup",
    parentIds: ["advertiserId", "campaignId"],
    idField: "AdGroupId",
    supportsBulk: true,
    supportsArchive: true,
  },
  ad: {
    apiPath: "/ad",
    parentIds: ["advertiserId", "adGroupId"],
    idField: "AdId",
  },
  creative: {
    apiPath: "/creative",
    parentIds: ["advertiserId"],
    idField: "CreativeId",
  },
  siteList: {
    apiPath: "/sitelist",
    parentIds: ["advertiserId"],
    idField: "SiteListId",
  },
  deal: {
    apiPath: "/deal",
    parentIds: ["advertiserId"],
    idField: "DealId",
  },
  conversionTracker: {
    apiPath: "/tracking",
    parentIds: ["advertiserId"],
    idField: "TrackingTagId",
  },
  bidList: {
    apiPath: "/bidlist",
    parentIds: ["advertiserId"],
    idField: "BidListId",
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
