/**
 * SA360 Entity Mapping
 *
 * Static configuration for SA360 entity types.
 * Maps entity types to SA360 query language resource names.
 *
 * SA360 is read-only for entities — no mutate endpoints.
 * Entity hierarchy: Customer → Campaign → Ad Group → Ad / Criterion
 */

export type SA360EntityType =
  | "customer"
  | "campaign"
  | "adGroup"
  | "adGroupAd"
  | "adGroupCriterion"
  | "campaignCriterion"
  | "biddingStrategy"
  | "conversionAction";

export interface SA360EntityConfig {
  /** SA360 query language resource name (e.g., "campaign", "ad_group") */
  queryResource: string;
  /** SA360 field path to the entity's ID (e.g., "campaign.id") */
  idField: string;
  /** SA360 field path to the entity's status (e.g., "campaign.status") */
  statusField?: string;
  /** SA360 field path to the entity's name (e.g., "campaign.name") */
  nameField?: string;
}

const ENTITY_CONFIGS: Record<SA360EntityType, SA360EntityConfig> = {
  customer: {
    queryResource: "customer",
    idField: "customer.id",
    nameField: "customer.descriptive_name",
  },
  campaign: {
    queryResource: "campaign",
    idField: "campaign.id",
    statusField: "campaign.status",
    nameField: "campaign.name",
  },
  adGroup: {
    queryResource: "ad_group",
    idField: "ad_group.id",
    statusField: "ad_group.status",
    nameField: "ad_group.name",
  },
  adGroupAd: {
    queryResource: "ad_group_ad",
    idField: "ad_group_ad.ad.id",
    statusField: "ad_group_ad.status",
    nameField: "ad_group_ad.ad.name",
  },
  adGroupCriterion: {
    queryResource: "ad_group_criterion",
    idField: "ad_group_criterion.criterion_id",
    statusField: "ad_group_criterion.status",
  },
  campaignCriterion: {
    queryResource: "campaign_criterion",
    idField: "campaign_criterion.criterion_id",
  },
  biddingStrategy: {
    queryResource: "bidding_strategy",
    idField: "bidding_strategy.id",
    statusField: "bidding_strategy.status",
    nameField: "bidding_strategy.name",
  },
  conversionAction: {
    queryResource: "conversion_action",
    idField: "conversion_action.id",
    statusField: "conversion_action.status",
    nameField: "conversion_action.name",
  },
};

export function getEntityConfig(entityType: SA360EntityType): SA360EntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown SA360 entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): SA360EntityType[] {
  return Object.keys(ENTITY_CONFIGS) as SA360EntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}
