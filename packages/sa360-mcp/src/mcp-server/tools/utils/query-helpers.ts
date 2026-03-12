/**
 * SA360 Query Language Helpers
 *
 * Utility functions for building SA360 queries dynamically.
 * SA360 query language mirrors GAQL syntax with SA360-specific resource names.
 */

import { getEntityConfig, type SA360EntityType } from "./entity-mapping.js";

/**
 * Regex for valid SA360 query field names (e.g., "campaign.status", "ad_group.name").
 * Defense-in-depth: prevents injection into query strings even though the API also validates.
 */
const VALID_FIELD_NAME = /^[a-z_][a-z0-9_.]*$/;

/**
 * Validate a field name for use in SA360 queries.
 * Throws if the field name contains characters outside the allowed pattern.
 */
function validateFieldName(field: string, context: string): void {
  if (!VALID_FIELD_NAME.test(field)) {
    throw new Error(
      `Invalid ${context} field name: "${field}". Field names must match pattern [a-z_][a-z0-9_.]* (lowercase letters, digits, underscores, and dots).`
    );
  }
}

/**
 * Common fields for each entity type.
 * These are the default fields selected when listing entities.
 */
const DEFAULT_SELECT_FIELDS: Record<SA360EntityType, string[]> = {
  customer: [
    "customer.id",
    "customer.descriptive_name",
    "customer.currency_code",
    "customer.time_zone",
    "customer.resource_name",
  ],
  campaign: [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "campaign.advertising_channel_type",
    "campaign.start_date",
    "campaign.end_date",
    "campaign.campaign_budget",
    "campaign.engine_id",
    "campaign.resource_name",
  ],
  adGroup: [
    "ad_group.id",
    "ad_group.name",
    "ad_group.status",
    "ad_group.type",
    "ad_group.campaign",
    "ad_group.cpc_bid_micros",
    "ad_group.engine_id",
    "ad_group.resource_name",
  ],
  adGroupAd: [
    "ad_group_ad.ad.id",
    "ad_group_ad.ad.name",
    "ad_group_ad.ad.type",
    "ad_group_ad.status",
    "ad_group_ad.ad_group",
    "ad_group_ad.engine_id",
    "ad_group_ad.resource_name",
  ],
  adGroupCriterion: [
    "ad_group_criterion.criterion_id",
    "ad_group_criterion.status",
    "ad_group_criterion.keyword.text",
    "ad_group_criterion.keyword.match_type",
    "ad_group_criterion.ad_group",
    "ad_group_criterion.engine_id",
    "ad_group_criterion.resource_name",
  ],
  campaignCriterion: [
    "campaign_criterion.criterion_id",
    "campaign_criterion.type",
    "campaign_criterion.campaign",
    "campaign_criterion.resource_name",
  ],
  biddingStrategy: [
    "bidding_strategy.id",
    "bidding_strategy.name",
    "bidding_strategy.status",
    "bidding_strategy.type",
    "bidding_strategy.resource_name",
  ],
  conversionAction: [
    "conversion_action.id",
    "conversion_action.name",
    "conversion_action.status",
    "conversion_action.type",
    "conversion_action.category",
    "conversion_action.resource_name",
  ],
};

/**
 * Build an SA360 query to list entities of a given type with optional filters.
 */
export function buildListQuery(
  entityType: SA360EntityType,
  filters?: Record<string, string>,
  orderBy?: string
): string {
  const config = getEntityConfig(entityType);
  const fields = DEFAULT_SELECT_FIELDS[entityType] || [config.idField];

  let query = `SELECT ${fields.join(", ")} FROM ${config.queryResource}`;

  const conditions: string[] = [];

  if (filters) {
    for (const [field, value] of Object.entries(filters)) {
      validateFieldName(field, "filter");
      // Support operator in the value: "= ENABLED", "> 1000", "IN ('ENABLED', 'PAUSED')"
      if (value.match(/^(=|!=|>|<|>=|<=|IN|LIKE|CONTAINS|NOT|BETWEEN|DURING|IS)\s/i)) {
        conditions.push(`${field} ${value}`);
      } else {
        // Escape single quotes in filter values
        conditions.push(`${field} = '${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
      }
    }
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  if (orderBy) {
    // Extract the field name from "field ASC" or "field DESC" or just "field"
    const orderByField = orderBy.split(/\s+/)[0];
    validateFieldName(orderByField, "orderBy");
    query += ` ORDER BY ${orderBy}`;
  }

  return query;
}

/**
 * Build an SA360 query to get a single entity by ID.
 */
export function buildGetByIdQuery(
  entityType: SA360EntityType,
  entityId: string
): string {
  const config = getEntityConfig(entityType);
  const fields = DEFAULT_SELECT_FIELDS[entityType] || [config.idField];

  return `SELECT ${fields.join(", ")} FROM ${config.queryResource} WHERE ${config.idField} = ${entityId} LIMIT 1`;
}
