/**
 * AmazonDsp Entity Mapping
 *
 * Static configuration for AmazonDsp Marketing API entity types.
 * All entities require profile_id in query params (GET) or body (POST).
 * AmazonDsp uses separate endpoints for status updates and deletes.
 */

export type AmazonDspEntityType = "campaign" | "adGroup" | "ad" | "creative";

export interface AmazonDspEntityConfig {
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
}

const ENTITY_CONFIGS: Record<AmazonDspEntityType, AmazonDspEntityConfig> = {
  campaign: {
    listPath: "/open_api/v1.3/campaign/get/",
    createPath: "/open_api/v1.3/campaign/create/",
    updatePath: "/open_api/v1.3/campaign/update/",
    statusUpdatePath: "/open_api/v1.3/campaign/status/update/",
    deletePath: "/open_api/v1.3/campaign/delete/",
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
  },
  adGroup: {
    listPath: "/open_api/v1.3/adgroup/get/",
    createPath: "/open_api/v1.3/adgroup/create/",
    updatePath: "/open_api/v1.3/adgroup/update/",
    statusUpdatePath: "/open_api/v1.3/adgroup/status/update/",
    deletePath: "/open_api/v1.3/adgroup/delete/",
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
  },
  ad: {
    listPath: "/open_api/v1.3/ad/get/",
    createPath: "/open_api/v1.3/ad/create/",
    updatePath: "/open_api/v1.3/ad/update/",
    statusUpdatePath: "/open_api/v1.3/ad/status/update/",
    deletePath: "/open_api/v1.3/ad/delete/",
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
  },
  creative: {
    listPath: "/open_api/v1.3/creative/adcreative/get/",
    createPath: "/open_api/v1.3/creative/adcreative/create/",
    updatePath: "/open_api/v1.3/creative/adcreative/update/",
    statusUpdatePath: "/open_api/v1.3/creative/adcreative/update/",
    deletePath: "/open_api/v1.3/creative/adcreative/delete/",
    idField: "creative_id",
    idsField: "creative_ids",
    displayName: "Creative",
    defaultFields: [
      "creative_id",
      "profile_id",
      "display_name",
      "image_ids",
      "video_id",
      "created_time",
    ],
  },
};

export function getEntityConfig(entityType: AmazonDspEntityType): AmazonDspEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown AmazonDsp entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): AmazonDspEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as AmazonDspEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

export function getDuplicateSupportedEntityTypes(): AmazonDspEntityType[] {
  return (Object.entries(ENTITY_CONFIGS) as [AmazonDspEntityType, AmazonDspEntityConfig][])
    .filter(([, config]) => config.supportsDuplicate)
    .map(([type]) => type);
}

export function getDuplicateEntityTypeEnum(): [string, ...string[]] {
  const types = getDuplicateSupportedEntityTypes();
  return types as [string, ...string[]];
}
