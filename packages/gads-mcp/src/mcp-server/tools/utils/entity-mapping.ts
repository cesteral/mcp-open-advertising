/**
 * Google Ads Entity Mapping
 *
 * Static configuration for Google Ads entity types.
 * Maps entity types to GAQL resource names and REST API mutate endpoints.
 *
 * Google Ads API uses:
 *  - GAQL (Google Ads Query Language) for read operations
 *  - :mutate endpoints for create/update/remove operations
 *
 * Entity hierarchy: Customer → Campaign (with CampaignBudget) → Ad Group → Ad / Keyword
 * Assets are standalone entities linked via CampaignAsset / AdGroupAsset associations.
 */

export type GAdsEntityType =
  | "campaign"
  | "adGroup"
  | "ad"
  | "keyword"
  | "campaignBudget"
  | "asset";

export type ParentIdKey = "customerId" | "campaignId" | "adGroupId";

export interface GAdsEntityConfig {
  /** GAQL resource name for SELECT queries (e.g., "campaign", "ad_group") */
  gaqlResource: string;
  /** REST API endpoint path segment for :mutate (e.g., "campaigns", "adGroups") */
  mutateEndpoint: string;
  /** Resource name pattern (e.g., "customers/{customerId}/campaigns/{campaignId}") */
  resourceNamePattern: string;
  /** Required parent IDs for this entity */
  parentIds: ParentIdKey[];
  /** GAQL field path to the entity's ID (e.g., "campaign.id") */
  idField: string;
  /** GAQL field path to the entity's status (e.g., "campaign.status") */
  statusField?: string;
  /** GAQL field path to the entity's name (e.g., "campaign.name") */
  nameField?: string;
}

const ENTITY_CONFIGS: Record<GAdsEntityType, GAdsEntityConfig> = {
  campaign: {
    gaqlResource: "campaign",
    mutateEndpoint: "campaigns",
    resourceNamePattern: "customers/{customerId}/campaigns/{campaignId}",
    parentIds: ["customerId"],
    idField: "campaign.id",
    statusField: "campaign.status",
    nameField: "campaign.name",
  },
  adGroup: {
    gaqlResource: "ad_group",
    mutateEndpoint: "adGroups",
    resourceNamePattern: "customers/{customerId}/adGroups/{adGroupId}",
    parentIds: ["customerId"],
    idField: "ad_group.id",
    statusField: "ad_group.status",
    nameField: "ad_group.name",
  },
  ad: {
    gaqlResource: "ad_group_ad",
    mutateEndpoint: "adGroupAds",
    resourceNamePattern: "customers/{customerId}/adGroupAds/{adGroupId}~{adId}",
    parentIds: ["customerId"],
    idField: "ad_group_ad.ad.id",
    statusField: "ad_group_ad.status",
    nameField: "ad_group_ad.ad.name",
  },
  keyword: {
    gaqlResource: "ad_group_criterion",
    mutateEndpoint: "adGroupCriteria",
    resourceNamePattern: "customers/{customerId}/adGroupCriteria/{adGroupId}~{criterionId}",
    parentIds: ["customerId"],
    idField: "ad_group_criterion.criterion_id",
    statusField: "ad_group_criterion.status",
  },
  campaignBudget: {
    gaqlResource: "campaign_budget",
    mutateEndpoint: "campaignBudgets",
    resourceNamePattern: "customers/{customerId}/campaignBudgets/{budgetId}",
    parentIds: ["customerId"],
    idField: "campaign_budget.id",
    nameField: "campaign_budget.name",
  },
  asset: {
    gaqlResource: "asset",
    mutateEndpoint: "assets",
    resourceNamePattern: "customers/{customerId}/assets/{assetId}",
    parentIds: ["customerId"],
    idField: "asset.id",
    nameField: "asset.name",
  },
};

export function getEntityConfig(entityType: GAdsEntityType): GAdsEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown Google Ads entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): GAdsEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as GAdsEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

/**
 * Build a resource name string for a specific entity.
 * e.g., "customers/123/campaigns/456"
 */
export function buildResourceName(
  entityType: GAdsEntityType,
  customerId: string,
  entityId: string
): string {
  const config = getEntityConfig(entityType);
  return `customers/${customerId}/${config.mutateEndpoint}/${entityId}`;
}

/**
 * Build the :mutate URL path for a given entity type and customer ID.
 * e.g., "/customers/123/campaigns:mutate"
 */
export function buildMutateUrl(
  entityType: GAdsEntityType,
  customerId: string
): string {
  const config = getEntityConfig(entityType);
  return `/customers/${customerId}/${config.mutateEndpoint}:mutate`;
}

