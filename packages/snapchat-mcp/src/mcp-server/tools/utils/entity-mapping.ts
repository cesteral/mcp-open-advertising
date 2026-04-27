// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Entity Mapping
 *
 * Static configuration for Snapchat Ads API v1 entity types.
 * Entity hierarchy: Campaigns → Ad Squads (adGroups) → Ads, Creatives
 *
 * Key Snapchat API patterns:
 * - List/create use adAccountId or parent entity ID in path
 * - Update/delete use entity-specific path with {entityId}
 * - Response envelope: { request_status, <responseKey>: [{ sub_request_status, <entityKey>: {...} }] }
 */

export type SnapchatEntityType = "campaign" | "adGroup" | "ad" | "creative";

export interface SnapchatEntityConfig {
  /** Path template for GET list (may contain {adAccountId}, {campaignId}, {adSquadId}) */
  listPath: string;
  /** Path template for POST create (usually adAccountId-based) */
  createPath: string;
  /** Path template for GET by id (entity-specific) */
  getPath: string;
  /** Path template for PUT update collection (parent scoped) */
  updatePath: string;
  /** Path template for DELETE (entity-specific: /v1/{entity}s/{entityId}) */
  deletePath: string;
  /** Primary ID field in the response object */
  idField: string;
  /** Response envelope array key (e.g., "campaigns", "adsquads") */
  responseKey: string;
  /** Inner entity key within each envelope item (e.g., "campaign", "adsquad") */
  entityKey: string;
  /** Display name for error messages */
  displayName: string;
  /** Default fields to include in responses */
  defaultFields: string[];
}

const ENTITY_CONFIGS: Record<SnapchatEntityType, SnapchatEntityConfig> = {
  campaign: {
    listPath: "/v1/adaccounts/{adAccountId}/campaigns",
    createPath: "/v1/adaccounts/{adAccountId}/campaigns",
    getPath: "/v1/campaigns/{entityId}",
    updatePath: "/v1/adaccounts/{adAccountId}/campaigns",
    deletePath: "/v1/campaigns/{entityId}",
    idField: "id",
    responseKey: "campaigns",
    entityKey: "campaign",
    displayName: "Campaign",
    defaultFields: [
      "id",
      "name",
      "status",
      "ad_account_id",
      "objective",
      "daily_budget_micro",
      "lifetime_spend_cap_micro",
      "start_time",
      "end_time",
    ],
  },
  adGroup: {
    listPath: "/v1/campaigns/{campaignId}/adsquads",
    createPath: "/v1/campaigns/{campaignId}/adsquads",
    getPath: "/v1/adsquads/{entityId}",
    updatePath: "/v1/campaigns/{campaignId}/adsquads",
    deletePath: "/v1/adsquads/{entityId}",
    idField: "id",
    responseKey: "adsquads",
    entityKey: "adsquad",
    displayName: "Ad Squad",
    defaultFields: [
      "id",
      "name",
      "status",
      "campaign_id",
      "daily_budget_micro",
      "bid_micro",
      "optimization_goal",
      "placement",
    ],
  },
  ad: {
    listPath: "/v1/adsquads/{adSquadId}/ads",
    createPath: "/v1/adsquads/{adSquadId}/ads",
    getPath: "/v1/ads/{entityId}",
    updatePath: "/v1/adsquads/{adSquadId}/ads",
    deletePath: "/v1/ads/{entityId}",
    idField: "id",
    responseKey: "ads",
    entityKey: "ad",
    displayName: "Ad",
    defaultFields: ["id", "name", "status", "ad_squad_id", "creative_id", "type"],
  },
  creative: {
    listPath: "/v1/adaccounts/{adAccountId}/creatives",
    createPath: "/v1/adaccounts/{adAccountId}/creatives",
    getPath: "/v1/creatives/{entityId}",
    updatePath: "/v1/adaccounts/{adAccountId}/creatives",
    deletePath: "/v1/creatives/{entityId}",
    idField: "id",
    responseKey: "creatives",
    entityKey: "creative",
    displayName: "Creative",
    defaultFields: [
      "id",
      "name",
      "type",
      "ad_account_id",
      "brand_name",
      "headline",
      "call_to_action",
    ],
  },
};

export function getEntityConfig(entityType: SnapchatEntityType): SnapchatEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown Snapchat entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): SnapchatEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as SnapchatEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

/**
 * Interpolate path template placeholders.
 * e.g. interpolatePath("/v1/adaccounts/{adAccountId}/campaigns", { adAccountId: "123" })
 * → "/v1/adaccounts/123/campaigns"
 */
export function interpolatePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((acc, [key, val]) => acc.replace(`{${key}}`, val), path);
}
