// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TikTok Entity Mapping
 *
 * Static configuration for TikTok Marketing API entity types.
 * All entities require advertiser_id in query params (GET) or body (POST).
 * TikTok uses separate endpoints for status updates and deletes.
 */

export type TikTokEntityType = "campaign" | "adGroup" | "ad" | "creative";

export interface TikTokEntityConfig {
  /** API path for list/get (GET) */
  listPath: string;
  /** API path for create (POST) */
  createPath: string;
  /** API path for update (POST) */
  updatePath: string;
  /** API path for status update (POST) */
  statusUpdatePath: string;
  /** API path for delete (POST) */
  deletePath: string;
  /** API path for duplicate/copy (POST), if supported */
  duplicatePath?: string;
  /** The field name used as the entity's primary ID */
  idField: string;
  /** The field name used in arrays for bulk operations (e.g., campaign_ids) */
  idsField: string;
  /** Display name for messages */
  displayName: string;
  /** Default fields to return when listing/getting */
  defaultFields: string[];
  /** Whether the entity supports duplication */
  supportsDuplicate?: boolean;
  /** Whether the entity supports dedicated status update endpoint */
  supportsStatusUpdate?: boolean;
}

/** Module-level API version used for building entity config paths. */
let apiVersion = "v1.3";

/** Set the API version used for entity config paths. Call before first tool invocation. */
export function setApiVersion(version: string): void {
  apiVersion = version;
}

function buildEntityConfigs(): Record<TikTokEntityType, TikTokEntityConfig> {
  const v = apiVersion;
  return {
    campaign: {
      listPath: `/open_api/${v}/campaign/get/`,
      createPath: `/open_api/${v}/campaign/create/`,
      updatePath: `/open_api/${v}/campaign/update/`,
      statusUpdatePath: `/open_api/${v}/campaign/status/update/`,
      deletePath: `/open_api/${v}/campaign/delete/`,
      idField: "campaign_id",
      idsField: "campaign_ids",
      displayName: "Campaign",
      defaultFields: [
        "campaign_id",
        "campaign_name",
        "status",
        "objective_type",
        "budget",
        "budget_mode",
        "created_time",
        "modify_time",
      ],
      supportsDuplicate: true,
      supportsStatusUpdate: true,
    },
    adGroup: {
      listPath: `/open_api/${v}/adgroup/get/`,
      createPath: `/open_api/${v}/adgroup/create/`,
      updatePath: `/open_api/${v}/adgroup/update/`,
      statusUpdatePath: `/open_api/${v}/adgroup/status/update/`,
      deletePath: `/open_api/${v}/adgroup/delete/`,
      idField: "adgroup_id",
      idsField: "adgroup_ids",
      displayName: "Ad Group",
      defaultFields: [
        "adgroup_id",
        "adgroup_name",
        "campaign_id",
        "status",
        "budget",
        "budget_mode",
        "schedule_type",
        "created_time",
      ],
      supportsDuplicate: true,
      supportsStatusUpdate: true,
    },
    ad: {
      listPath: `/open_api/${v}/ad/get/`,
      createPath: `/open_api/${v}/ad/create/`,
      updatePath: `/open_api/${v}/ad/update/`,
      statusUpdatePath: `/open_api/${v}/ad/status/update/`,
      deletePath: `/open_api/${v}/ad/delete/`,
      idField: "ad_id",
      idsField: "ad_ids",
      displayName: "Ad",
      defaultFields: [
        "ad_id",
        "adgroup_id",
        "ad_name",
        "status",
        "creative_type",
        "image_ids",
        "video_id",
        "created_time",
      ],
      supportsDuplicate: true,
      supportsStatusUpdate: true,
    },
    creative: {
      listPath: `/open_api/${v}/creative/adcreative/get/`,
      createPath: `/open_api/${v}/creative/adcreative/create/`,
      updatePath: `/open_api/${v}/creative/adcreative/update/`,
      // Creative has no dedicated /status/update/ endpoint — use regular update
      statusUpdatePath: "",
      deletePath: `/open_api/${v}/creative/adcreative/delete/`,
      idField: "creative_id",
      idsField: "creative_ids",
      displayName: "Creative",
      defaultFields: [
        "creative_id",
        "advertiser_id",
        "display_name",
        "image_ids",
        "video_id",
        "created_time",
      ],
    },
  };
}

/** Supported entity type keys (stable — not version-dependent). */
const ENTITY_TYPE_KEYS: TikTokEntityType[] = ["campaign", "adGroup", "ad", "creative"];

export function getEntityConfig(entityType: TikTokEntityType): TikTokEntityConfig {
  const configs = buildEntityConfigs();
  const config = configs[entityType];
  if (!config) {
    throw new Error(`Unknown TikTok entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): TikTokEntityType[] {
  return ENTITY_TYPE_KEYS;
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

export function getDuplicateSupportedEntityTypes(): TikTokEntityType[] {
  const configs = buildEntityConfigs();
  return (Object.entries(configs) as [TikTokEntityType, TikTokEntityConfig][])
    .filter(([, config]) => config.supportsDuplicate)
    .map(([type]) => type);
}

export function getDuplicateEntityTypeEnum(): [string, ...string[]] {
  const types = getDuplicateSupportedEntityTypes();
  return types as [string, ...string[]];
}