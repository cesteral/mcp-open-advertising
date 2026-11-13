// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import { getApiVersion } from "./entity-mapping.js";

/**
 * TikTok Upgraded Smart+ entity mapping.
 *
 * From 2027-01-01 TikTok's legacy `/campaign/create/`, `/adgroup/create/`,
 * `/ad/create/` (and `/campaign/copy/task/create/`, `/ad/aco/create/`) no longer
 * create non-Search Legacy Manual Flow campaigns, or ad groups and ads under
 * them, for the Sales (`WEB_CONVERSIONS`), App Promotion (`APP_PROMOTION`) and
 * Lead Generation (`LEAD_GENERATION`) objectives
 * (https://business-api.tiktok.com/portal/docs/whats-new/v1.3). The
 * replacement is the Upgraded Smart+ API under `/smart_plus/`.
 *
 * Differences from the legacy entities that the paths and id fields encode:
 * - The Smart+ ad is addressed by `smart_plus_ad_id` (update body, create
 *   response) and `smart_plus_ad_ids` (status update); campaigns and ad groups
 *   keep `campaign_id` / `adgroup_id`.
 * - `campaign/create/` and `adgroup/create/` require a `request_id`; `ad/create/`
 *   does not.
 * - Legacy `{campaign,adgroup,ad}/update/` cannot touch Upgraded Smart+
 *   entities (TikTok's compatibility table, doc id 1854112742370306).
 * - Reads need no Smart+ path: legacy `/campaign/get/`, `/adgroup/get/` and
 *   `/ad/get/` return Smart+ entities by default (`tiktok_get_entity`).
 *
 * Paths and required fields: tiktok/tiktok-business-api-sdk
 * `yml_files/smart_plus_{campaign,adgroup,ad}_{create,update,status_update}.yml`.
 */

export type SmartPlusEntityType = "campaign" | "adGroup" | "ad";

/** Objectives the 2027-01-01 cutoff applies to, as TikTok's `objective_type` values. */
export const SMART_PLUS_CUTOFF_OBJECTIVES = [
  "APP_PROMOTION",
  "WEB_CONVERSIONS",
  "LEAD_GENERATION",
] as const;

export interface SmartPlusEntityConfig {
  /** GET `/smart_plus/{entity}/get/` */
  getPath: string;
  /** POST `/smart_plus/{entity}/create/` */
  createPath: string;
  /** POST `/smart_plus/{entity}/update/` */
  updatePath: string;
  /** POST `/smart_plus/{entity}/status/update/` — also how an entity is deleted. */
  statusUpdatePath: string;
  /** Id field in the update body and the create response. */
  idField: string;
  /** Id-array field in the status-update body. */
  idsField: string;
  /** Whether `create/` requires a `request_id` (idempotency token). */
  requiresRequestId: boolean;
  /** Display name for messages. */
  displayName: string;
}

const SMART_PLUS_ENTITY_TYPE_KEYS: SmartPlusEntityType[] = ["campaign", "adGroup", "ad"];

function buildSmartPlusConfigs(): Record<SmartPlusEntityType, SmartPlusEntityConfig> {
  const base = `/open_api/${getApiVersion()}/smart_plus`;
  return {
    campaign: {
      getPath: `${base}/campaign/get/`,
      createPath: `${base}/campaign/create/`,
      updatePath: `${base}/campaign/update/`,
      statusUpdatePath: `${base}/campaign/status/update/`,
      idField: "campaign_id",
      idsField: "campaign_ids",
      requiresRequestId: true,
      displayName: "Upgraded Smart+ Campaign",
    },
    adGroup: {
      getPath: `${base}/adgroup/get/`,
      createPath: `${base}/adgroup/create/`,
      updatePath: `${base}/adgroup/update/`,
      statusUpdatePath: `${base}/adgroup/status/update/`,
      idField: "adgroup_id",
      idsField: "adgroup_ids",
      requiresRequestId: true,
      displayName: "Upgraded Smart+ Ad Group",
    },
    ad: {
      getPath: `${base}/ad/get/`,
      createPath: `${base}/ad/create/`,
      updatePath: `${base}/ad/update/`,
      statusUpdatePath: `${base}/ad/status/update/`,
      idField: "smart_plus_ad_id",
      idsField: "smart_plus_ad_ids",
      requiresRequestId: false,
      displayName: "Upgraded Smart+ Ad",
    },
  };
}

export function getSmartPlusEntityConfig(entityType: SmartPlusEntityType): SmartPlusEntityConfig {
  const config = buildSmartPlusConfigs()[entityType];
  if (!config) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unknown Upgraded Smart+ entity type: ${String(entityType)}`
    );
  }
  return config;
}

export function getSmartPlusEntityTypeEnum(): [string, ...string[]] {
  return SMART_PLUS_ENTITY_TYPE_KEYS as [string, ...string[]];
}
