// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";

/**
 * TikTok Entity Mapping
 *
 * Static configuration for TikTok Marketing API entity types.
 * All entities require advertiser_id in query params (GET) or body (POST).
 *
 * Paths are the ones TikTok's official Business API SDK
 * (github.com/tiktok/tiktok-business-api-sdk) defines for v1.3:
 * `{campaign,adgroup,ad}/{get,create,update,status/update}/`. The SDK has no
 * `*\/delete/` or `*\/copy/` endpoint for these entities — deletion is
 * `status/update/` with `operation_status: "DELETE"` (the StatusOptType enum
 * is ENABLE/DISABLE/DELETE), and there is no server-side copy.
 *
 * There is also no `creative` entity: the v1.2-era `creative/adcreative/*`
 * endpoints are absent from the v1.3 SDK. Creatives are part of the ad
 * (`creatives[]` on ad/create and ad/update); assets are uploaded with
 * tiktok_upload_image / tiktok_upload_video.
 */

export type TikTokEntityType = "campaign" | "adGroup" | "ad";

export interface TikTokEntityConfig {
  /** API path for list/get (GET) */
  listPath: string;
  /** API path for create (POST) */
  createPath: string;
  /** API path for update (POST) */
  updatePath: string;
  /** API path for status update (POST) — also how an entity is deleted (operation_status DELETE) */
  statusUpdatePath: string;
  /** The field name used as the entity's primary ID */
  idField: string;
  /** The field name used in arrays for bulk operations (e.g., campaign_ids) */
  idsField: string;
  /** Display name for messages */
  displayName: string;
  /** Default fields to return when listing/getting */
  defaultFields: string[];
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
      supportsStatusUpdate: true,
    },
    adGroup: {
      listPath: `/open_api/${v}/adgroup/get/`,
      createPath: `/open_api/${v}/adgroup/create/`,
      updatePath: `/open_api/${v}/adgroup/update/`,
      statusUpdatePath: `/open_api/${v}/adgroup/status/update/`,
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
      supportsStatusUpdate: true,
    },
    ad: {
      listPath: `/open_api/${v}/ad/get/`,
      createPath: `/open_api/${v}/ad/create/`,
      updatePath: `/open_api/${v}/ad/update/`,
      statusUpdatePath: `/open_api/${v}/ad/status/update/`,
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
      supportsStatusUpdate: true,
    },
  };
}

/** Supported entity type keys (stable — not version-dependent). */
const ENTITY_TYPE_KEYS: TikTokEntityType[] = ["campaign", "adGroup", "ad"];

export function getEntityConfig(entityType: TikTokEntityType): TikTokEntityConfig {
  const configs = buildEntityConfigs();
  const config = configs[entityType];
  if (!config) {
    if ((entityType as string) === "creative") {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        "TikTok Marketing API v1.3 has no standalone creative entity (no creative/adcreative/* endpoints). " +
          "Creatives are set on the ad itself via `creatives[]` in tiktok_create_entity / tiktok_update_entity " +
          "with entityType 'ad'; upload assets first with tiktok_upload_image / tiktok_upload_video."
      );
    }
    throw new McpError(JsonRpcErrorCode.InvalidParams, `Unknown TikTok entity type: ${entityType}`);
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
