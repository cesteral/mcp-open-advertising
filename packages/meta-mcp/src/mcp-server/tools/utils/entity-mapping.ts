// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Entity Mapping
 *
 * Static configuration for Meta Ads entity types.
 * All entity creation is scoped to the ad account (flat, not nested parent edges).
 * Account IDs are prefixed with `act_` in API calls.
 */

export type MetaEntityType = "campaign" | "adSet" | "ad" | "adCreative" | "customAudience";

/** Entity types that support duplication via POST /{id}/copies */
export type DuplicateSupportedEntityType = "campaign" | "adSet" | "ad";

export interface MetaEntityConfig {
  /** API edge on the ad account (e.g., "campaigns") */
  edge: string;
  /** Display name for messages */
  displayName: string;
  /** Default fields to request when listing/getting */
  defaultFields: string[];
  /** Whether the entity supports duplication */
  supportsDuplicate?: boolean;
}

const ENTITY_CONFIGS: Record<MetaEntityType, MetaEntityConfig> = {
  campaign: {
    edge: "campaigns",
    displayName: "Campaign",
    defaultFields: [
      "id",
      "name",
      "status",
      "configured_status",
      "objective",
      "buying_type",
      "daily_budget",
      "lifetime_budget",
      "budget_remaining",
      "bid_strategy",
      "special_ad_categories",
      "special_ad_category_country",
      "start_time",
      "stop_time",
      "created_time",
      "updated_time",
    ],
    supportsDuplicate: true,
  },
  adSet: {
    edge: "adsets",
    displayName: "Ad Set",
    defaultFields: [
      "id",
      "name",
      "status",
      "campaign_id",
      "optimization_goal",
      "billing_event",
      "bid_amount",
      "bid_strategy",
      "bid_constraints",
      "daily_budget",
      "lifetime_budget",
      "budget_remaining",
      "targeting",
      "frequency_control_specs",
      "destination_type",
      "promoted_object",
      "attribution_spec",
      "pacing_type",
      "is_dynamic_creative",
      "dsa_beneficiary",
      "dsa_payor",
      "start_time",
      "end_time",
      "created_time",
      "updated_time",
    ],
    supportsDuplicate: true,
  },
  ad: {
    edge: "ads",
    displayName: "Ad",
    defaultFields: [
      "id",
      "name",
      "status",
      "adset_id",
      "campaign_id",
      "creative",
      "bid_amount",
      "tracking_specs",
      "conversion_domain",
      "preview_shareable_link",
      "created_time",
      "updated_time",
    ],
    supportsDuplicate: true,
  },
  adCreative: {
    edge: "adcreatives",
    displayName: "Ad Creative",
    defaultFields: [
      "id",
      "name",
      "status",
      "body",
      "title",
      "image_url",
      "image_hash",
      "thumbnail_url",
      "object_story_spec",
      "object_type",
      "effective_object_story_id",
      "asset_feed_spec",
      "url_tags",
      "link_url",
      "dynamic_creative_spec",
      "degrees_of_freedom_spec",
      "product_set_id",
      "created_time",
    ],
  },
  customAudience: {
    edge: "customaudiences",
    displayName: "Custom Audience",
    defaultFields: [
      "id",
      "name",
      "description",
      "approximate_count",
      "subtype",
      "time_created",
      "time_updated",
    ],
  },
};

export function getEntityConfig(entityType: MetaEntityType): MetaEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown Meta entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): MetaEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as MetaEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

export function getDuplicateSupportedEntityTypes(): DuplicateSupportedEntityType[] {
  return (Object.entries(ENTITY_CONFIGS) as [MetaEntityType, MetaEntityConfig][])
    .filter(([, config]) => config.supportsDuplicate)
    .map(([type]) => type) as DuplicateSupportedEntityType[];
}

export function getDuplicateEntityTypeEnum(): [string, ...string[]] {
  const types = getDuplicateSupportedEntityTypes();
  return types as [string, ...string[]];
}
