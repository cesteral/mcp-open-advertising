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
  /** Batch limit for add/update operations */
  batchLimit: number;
}

const ENTITY_CONFIGS: Record<MsAdsEntityType, MsAdsEntityConfig> = {
  campaign: {
    addOperation: "/Campaigns/Add",
    getByAccountOperation: "/Campaigns/GetByAccountId",
    getByIdsOperation: "/Campaigns/GetByIds",
    updateOperation: "/Campaigns/Update",
    deleteOperation: "/Campaigns/Delete",
    idField: "Id",
    pluralName: "Campaigns",
    displayName: "Campaign",
    batchLimit: 100,
  },
  adGroup: {
    addOperation: "/AdGroups/Add",
    getByParentOperation: "/AdGroups/GetByCampaignId",
    getByIdsOperation: "/AdGroups/GetByIds",
    updateOperation: "/AdGroups/Update",
    deleteOperation: "/AdGroups/Delete",
    idField: "Id",
    parentIdField: "CampaignId",
    pluralName: "AdGroups",
    displayName: "Ad Group",
    batchLimit: 1000,
  },
  ad: {
    addOperation: "/Ads/Add",
    getByParentOperation: "/Ads/GetByAdGroupId",
    getByIdsOperation: "/Ads/GetByIds",
    updateOperation: "/Ads/Update",
    deleteOperation: "/Ads/Delete",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Ads",
    displayName: "Ad",
    batchLimit: 50,
  },
  keyword: {
    addOperation: "/Keywords/Add",
    getByParentOperation: "/Keywords/GetByAdGroupId",
    getByIdsOperation: "/Keywords/GetByIds",
    updateOperation: "/Keywords/Update",
    deleteOperation: "/Keywords/Delete",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Keywords",
    displayName: "Keyword",
    batchLimit: 1000,
  },
  budget: {
    addOperation: "/Budgets/Add",
    getByIdsOperation: "/Budgets/GetByIds",
    updateOperation: "/Budgets/Update",
    deleteOperation: "/Budgets/Delete",
    idField: "Id",
    pluralName: "Budgets",
    displayName: "Budget",
    batchLimit: 100,
  },
  adExtension: {
    addOperation: "/AdExtensions/Add",
    getByIdsOperation: "/AdExtensions/GetByIds",
    updateOperation: "/AdExtensions/Update",
    deleteOperation: "/AdExtensions/Delete",
    idField: "Id",
    pluralName: "AdExtensions",
    displayName: "Ad Extension",
    batchLimit: 100,
  },
  audience: {
    addOperation: "/Audiences/Add",
    getByIdsOperation: "/Audiences/GetByIds",
    updateOperation: "/Audiences/Update",
    deleteOperation: "/Audiences/Delete",
    idField: "Id",
    pluralName: "Audiences",
    displayName: "Audience",
    batchLimit: 100,
  },
  label: {
    addOperation: "/Labels/Add",
    getByIdsOperation: "/Labels/GetByIds",
    updateOperation: "/Labels/Update",
    deleteOperation: "/Labels/Delete",
    idField: "Id",
    pluralName: "Labels",
    displayName: "Label",
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