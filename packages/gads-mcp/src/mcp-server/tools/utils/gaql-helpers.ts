// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * GAQL (Google Ads Query Language) Helpers
 *
 * Utility functions for building GAQL queries dynamically.
 * GAQL reference: https://developers.google.com/google-ads/api/docs/query/structure
 */

import { getEntityConfig, type GAdsEntityType } from "./entity-mapping.js";

/**
 * Common GAQL fields for each entity type.
 * These are the default fields selected when listing entities.
 */
const DEFAULT_SELECT_FIELDS: Record<GAdsEntityType, string[]> = {
  campaign: [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "campaign.advertising_channel_type",
    "campaign.start_date",
    "campaign.end_date",
    "campaign.campaign_budget",
    "campaign.resource_name",
  ],
  adGroup: [
    "ad_group.id",
    "ad_group.name",
    "ad_group.status",
    "ad_group.type",
    "ad_group.campaign",
    "ad_group.cpc_bid_micros",
    "ad_group.cpm_bid_micros",
    "ad_group.resource_name",
  ],
  ad: [
    "ad_group_ad.ad.id",
    "ad_group_ad.ad.name",
    "ad_group_ad.ad.type",
    "ad_group_ad.status",
    "ad_group_ad.ad_group",
    "ad_group_ad.ad.final_urls",
    "ad_group_ad.resource_name",
  ],
  keyword: [
    "ad_group_criterion.criterion_id",
    "ad_group_criterion.keyword.text",
    "ad_group_criterion.keyword.match_type",
    "ad_group_criterion.status",
    "ad_group_criterion.ad_group",
    "ad_group_criterion.resource_name",
  ],
  campaignBudget: [
    "campaign_budget.id",
    "campaign_budget.name",
    "campaign_budget.amount_micros",
    "campaign_budget.delivery_method",
    "campaign_budget.status",
    "campaign_budget.resource_name",
  ],
  asset: [
    "asset.id",
    "asset.name",
    "asset.type",
    "asset.resource_name",
  ],
};

/**
 * Build a GAQL query to list entities of a given type with optional filters.
 */
export function buildListQuery(
  entityType: GAdsEntityType,
  filters?: Record<string, string>,
  orderBy?: string
): string {
  const config = getEntityConfig(entityType);
  const fields = DEFAULT_SELECT_FIELDS[entityType] || [config.idField];

  let query = `SELECT ${fields.join(", ")} FROM ${config.gaqlResource}`;

  const conditions: string[] = [];

  if (filters) {
    for (const [field, value] of Object.entries(filters)) {
      // Support operator in the value: "= ENABLED", "> 1000", "IN ('ENABLED', 'PAUSED')"
      if (value.match(/^(=|!=|>|<|>=|<=|IN|LIKE|CONTAINS|NOT|BETWEEN|DURING|IS)\s/i)) {
        conditions.push(`${field} ${value}`);
      } else {
        // Escape single quotes in filter values for GAQL safety
        conditions.push(`${field} = '${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
      }
    }
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  if (orderBy) {
    query += ` ORDER BY ${orderBy}`;
  }

  // Note: No LIMIT clause — pagination is handled by the API's pageSize/pageToken
  // body parameters in gaqlSearch(). Adding LIMIT here would cap total results and
  // prevent multi-page iteration.

  return query;
}

/**
 * Build a GAQL query to get a single entity by ID.
 */
export function buildGetByIdQuery(
  entityType: GAdsEntityType,
  entityId: string
): string {
  if (!/^\d+$/.test(entityId)) {
    throw new Error(`Invalid entity ID: "${entityId}". Entity IDs must be numeric.`);
  }

  const config = getEntityConfig(entityType);
  const fields = DEFAULT_SELECT_FIELDS[entityType] || [config.idField];

  return `SELECT ${fields.join(", ")} FROM ${config.gaqlResource} WHERE ${config.idField} = ${entityId} LIMIT 1`;
}