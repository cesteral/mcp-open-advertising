/**
 * TTD Entity Mapping
 *
 * Static configuration for TTD entity types.
 * TTD API is more regular than DV360 — no dynamic introspection needed.
 */

export type TtdEntityType = "advertiser" | "campaign" | "adGroup" | "ad";

export interface TtdEntityConfig {
  apiPath: string;
  parentIds: string[];
  idField: string;
}

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
  },
  adGroup: {
    apiPath: "/adgroup",
    parentIds: ["advertiserId"],
    idField: "AdGroupId",
  },
  ad: {
    apiPath: "/ad",
    parentIds: ["advertiserId"],
    idField: "AdId",
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
