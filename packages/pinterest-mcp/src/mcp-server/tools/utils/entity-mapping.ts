// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Entity Mapping
 *
 * Static configuration for Pinterest Marketing API v5 entity types.
 * Pinterest v5 uses path-based URL structure with ad_account_id in the URL path.
 * Use interpolatePath() to substitute {adAccountId} and {entityId} placeholders at runtime.
 */

export type PinterestEntityType = "campaign" | "adGroup" | "ad" | "creative";

export interface PinterestEntityConfig {
  /** Path template for list/get. {adAccountId} is substituted at runtime. */
  listPath: string;
  /**
   * Path template for fetching a single entity by ID.
   * If provided, used for direct GET by entity ID (e.g., "/v5/pins/{entityId}").
   * If undefined, getEntity falls back to listing and filtering by ID.
   */
  getPath?: string;
  /** Path template for create (POST). */
  createPath: string;
  /** Path template for PATCH update (bulk). {adAccountId} substituted. */
  updatePath: string;
  /** Path for status update — same as updatePath (status is a field). */
  statusUpdatePath: string;
  /** Path for DELETE. May use {adAccountId} for query-param style or {entityId} for single. */
  deletePath: string;
  duplicatePath?: string;
  /** Primary ID field name in API response (e.g., "id") */
  idField: string;
  /** Query param name for batch delete (e.g., "campaign_ids") */
  deleteIdsParam: string;
  displayName: string;
  defaultFields: string[];
  supportsDuplicate?: boolean;
}

const ENTITY_CONFIGS: Record<PinterestEntityType, PinterestEntityConfig> = {
  campaign: {
    listPath: "/v5/ad_accounts/{adAccountId}/campaigns",
    createPath: "/v5/ad_accounts/{adAccountId}/campaigns",
    updatePath: "/v5/ad_accounts/{adAccountId}/campaigns",
    statusUpdatePath: "/v5/ad_accounts/{adAccountId}/campaigns",
    deletePath: "/v5/ad_accounts/{adAccountId}/campaigns",
    idField: "id",
    deleteIdsParam: "campaign_ids",
    displayName: "Campaign",
    defaultFields: [
      "id",
      "name",
      "status",
      "objective_type",
      "daily_spend_cap",
      "lifetime_spend_cap",
      "created_time",
      "updated_time",
    ],
    supportsDuplicate: true,
  },
  adGroup: {
    listPath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    createPath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    updatePath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    statusUpdatePath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    deletePath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    idField: "id",
    deleteIdsParam: "ad_group_ids",
    displayName: "Ad Group",
    defaultFields: [
      "id",
      "name",
      "status",
      "campaign_id",
      "budget_in_micro_currency",
      "pacing_delivery_type",
      "bid_strategy_type",
      "created_time",
    ],
    supportsDuplicate: false,
  },
  ad: {
    listPath: "/v5/ad_accounts/{adAccountId}/ads",
    createPath: "/v5/ad_accounts/{adAccountId}/ads",
    updatePath: "/v5/ad_accounts/{adAccountId}/ads",
    statusUpdatePath: "/v5/ad_accounts/{adAccountId}/ads",
    deletePath: "/v5/ad_accounts/{adAccountId}/ads",
    idField: "id",
    deleteIdsParam: "ad_ids",
    displayName: "Ad",
    defaultFields: [
      "id",
      "name",
      "status",
      "ad_group_id",
      "creative_type",
      "pin_id",
      "created_time",
    ],
    supportsDuplicate: false,
  },
  creative: {
    listPath: "/v5/pins",
    getPath: "/v5/pins/{entityId}",
    createPath: "/v5/pins",
    updatePath: "/v5/pins/{entityId}",
    statusUpdatePath: "/v5/pins/{entityId}",
    deletePath: "/v5/pins/{entityId}",
    idField: "id",
    deleteIdsParam: "pin_id",
    displayName: "Pin (Creative)",
    defaultFields: [
      "id",
      "title",
      "description",
      "media",
      "link",
      "created_at",
    ],
    supportsDuplicate: false,
  },
};

/**
 * Substitute {placeholder} tokens in a path template.
 * Example: interpolatePath("/v5/ad_accounts/{adAccountId}/campaigns", { adAccountId: "act_123" })
 *   → "/v5/ad_accounts/act_123/campaigns"
 */
export function interpolatePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, val),
    path
  );
}

export function getEntityConfig(entityType: PinterestEntityType): PinterestEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown Pinterest entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): PinterestEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as PinterestEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

export function getDuplicateSupportedEntityTypes(): PinterestEntityType[] {
  return (Object.entries(ENTITY_CONFIGS) as [PinterestEntityType, PinterestEntityConfig][])
    .filter(([, config]) => config.supportsDuplicate)
    .map(([type]) => type);
}

export function getDuplicateEntityTypeEnum(): [string, ...string[]] {
  const types = getDuplicateSupportedEntityTypes();
  return types as [string, ...string[]];
}