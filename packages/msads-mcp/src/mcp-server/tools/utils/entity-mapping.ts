// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export type MsAdsEntityType =
  | "campaign"
  | "adGroup"
  | "ad"
  | "keyword"
  | "budget"
  | "adExtension"
  | "audience"
  | "label";

export interface MsAdsEntityConfig {
  /** REST operation path for adding entities (POST) */
  addOperation: string;
  /** REST operation path for getting by account ID (POST) */
  getByAccountOperation?: string;
  /** REST operation path for getting by parent entity ID (POST) */
  getByParentOperation?: string;
  /** REST operation path for getting by entity IDs (POST) */
  getByIdsOperation: string;
  /** REST operation path for updating entities (POST) */
  updateOperation: string;
  /** REST operation path for deleting entities (POST) */
  deleteOperation: string;
  /** Primary ID field in the response object */
  idField: string;
  /** Parent ID field (e.g., CampaignId for adGroups) */
  parentIdField?: string;
  /** Plural name for the entity (used as response/request key) */
  pluralName: string;
  /** Singular display name */
  displayName: string;
  /** Request body key for entity ID arrays (e.g., "CampaignIds") */
  idsField: string;
  /** Batch limit for add/update operations */
  batchLimit: number;
  /** Additional required request body fields when querying by IDs */
  requiredGetByIdsFields?: string[];
}

const ENTITY_CONFIGS: Record<MsAdsEntityType, MsAdsEntityConfig> = {
  campaign: {
    addOperation: "/Campaigns",
    getByAccountOperation: "/Campaigns/QueryByAccountId",
    getByIdsOperation: "/Campaigns/QueryByIds",
    updateOperation: "/Campaigns",
    deleteOperation: "/Campaigns",
    idField: "Id",
    pluralName: "Campaigns",
    displayName: "Campaign",
    idsField: "CampaignIds",
    batchLimit: 100,
    requiredGetByIdsFields: ["AccountId"],
  },
  adGroup: {
    addOperation: "/AdGroups",
    getByParentOperation: "/AdGroups/QueryByCampaignId",
    getByIdsOperation: "/AdGroups/QueryByIds",
    updateOperation: "/AdGroups",
    deleteOperation: "/AdGroups",
    idField: "Id",
    parentIdField: "CampaignId",
    pluralName: "AdGroups",
    displayName: "Ad Group",
    idsField: "AdGroupIds",
    batchLimit: 1000,
    requiredGetByIdsFields: ["CampaignId"],
  },
  ad: {
    addOperation: "/Ads",
    getByParentOperation: "/Ads/QueryByAdGroupId",
    getByIdsOperation: "/Ads/QueryByIds",
    updateOperation: "/Ads",
    deleteOperation: "/Ads",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Ads",
    displayName: "Ad",
    idsField: "AdIds",
    batchLimit: 50,
    requiredGetByIdsFields: ["AdGroupId"],
  },
  keyword: {
    addOperation: "/Keywords",
    getByParentOperation: "/Keywords/QueryByAdGroupId",
    getByIdsOperation: "/Keywords/QueryByIds",
    updateOperation: "/Keywords",
    deleteOperation: "/Keywords",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Keywords",
    displayName: "Keyword",
    idsField: "KeywordIds",
    batchLimit: 1000,
    requiredGetByIdsFields: ["AdGroupId"],
  },
  budget: {
    addOperation: "/Budgets",
    getByIdsOperation: "/Budgets/QueryByIds",
    updateOperation: "/Budgets",
    deleteOperation: "/Budgets",
    idField: "Id",
    pluralName: "Budgets",
    displayName: "Budget",
    idsField: "BudgetIds",
    batchLimit: 100,
  },
  adExtension: {
    addOperation: "/AdExtensions",
    getByIdsOperation: "/AdExtensions/QueryByIds",
    updateOperation: "/AdExtensions",
    deleteOperation: "/AdExtensions",
    idField: "Id",
    pluralName: "AdExtensions",
    displayName: "Ad Extension",
    idsField: "AdExtensionIds",
    batchLimit: 100,
    requiredGetByIdsFields: ["AccountId", "AdExtensionType"],
  },
  audience: {
    addOperation: "/Audiences",
    getByIdsOperation: "/Audiences/QueryByIds",
    updateOperation: "/Audiences",
    deleteOperation: "/Audiences",
    idField: "Id",
    pluralName: "Audiences",
    displayName: "Audience",
    idsField: "AudienceIds",
    batchLimit: 100,
  },
  label: {
    addOperation: "/Labels",
    getByIdsOperation: "/Labels/QueryByIds",
    updateOperation: "/Labels",
    deleteOperation: "/Labels",
    idField: "Id",
    pluralName: "Labels",
    displayName: "Label",
    idsField: "LabelIds",
    batchLimit: 100,
  },
};

export function getEntityConfig(entityType: MsAdsEntityType): MsAdsEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown Microsoft Ads entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): MsAdsEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as MsAdsEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}
