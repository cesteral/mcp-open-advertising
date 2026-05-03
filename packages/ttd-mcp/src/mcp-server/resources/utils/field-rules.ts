// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD field-rule constants.
 *
 * Single source of truth for the per-entity required-field rules, optional
 * enum-typed fields, and read-only fields used by `ttd_validate_entity`. The
 * same tables back the `ttd-field-rules://{entityType}` MCP resource so
 * clients can discover what to send before invoking write tools.
 *
 * TTD REST API enum reference:
 *   https://api.thetradedesk.com/v3/portal/api/doc/
 */

import type { FieldRule } from "@cesteral/shared";
import type { TtdEntityType } from "../../tools/utils/entity-mapping.js";

export const PACING_MODES = ["PaceEvenly", "PaceAhead", "PaceAsap"] as const;
export const AVAILABILITY = ["Available", "Archived"] as const;
export const TRACKING_TAG_TYPES = [
  "Universal",
  "Standard",
  "Pixel",
  "JavaScript",
  "ServerToServer",
] as const;
export const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "SGD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "MXN",
  "BRL",
  "INR",
  "CNY",
  "HKD",
  "NZD",
  "ZAR",
] as const;

export const REQUIRED_FIELDS_CREATE: Record<TtdEntityType, FieldRule[]> = {
  advertiser: [
    { field: "PartnerId", expectedType: "string" },
    { field: "AdvertiserName", expectedType: "string" },
    {
      field: "CurrencyCode",
      expectedType: "string",
      hint: "ISO 4217 currency code",
      suggestedValues: COMMON_CURRENCIES,
    },
  ],
  campaign: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CampaignName", expectedType: "string" },
    { field: "Budget", expectedType: "object", hint: "{ Amount, CurrencyCode }" },
    { field: "StartDate", expectedType: "string", hint: "ISO-8601 datetime" },
    {
      field: "PacingMode",
      expectedType: "string",
      hint: "Budget pacing strategy",
      suggestedValues: PACING_MODES,
    },
  ],
  adGroup: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CampaignId", expectedType: "string" },
    { field: "AdGroupName", expectedType: "string" },
    {
      field: "RTBAttributes",
      expectedType: "object",
      hint: "must contain BudgetSettings and BaseBidCPM",
    },
  ],
  creative: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CreativeName", expectedType: "string" },
  ],
  conversionTracker: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "TrackingTagName", expectedType: "string" },
  ],
};

/** Optional enum-typed fields validated when present (not required). */
export const OPTIONAL_ENUM_FIELDS: Record<TtdEntityType, FieldRule[]> = {
  advertiser: [
    {
      field: "Availability",
      expectedType: "string",
      hint: "Advertiser availability state",
      suggestedValues: AVAILABILITY,
    },
  ],
  campaign: [
    {
      field: "Availability",
      expectedType: "string",
      hint: "Campaign availability state",
      suggestedValues: AVAILABILITY,
    },
  ],
  adGroup: [
    {
      field: "Availability",
      expectedType: "string",
      hint: "Ad group availability state",
      suggestedValues: AVAILABILITY,
    },
  ],
  creative: [],
  conversionTracker: [
    {
      field: "TrackingTagType",
      expectedType: "string",
      hint: "Conversion tracker tag type",
      suggestedValues: TRACKING_TAG_TYPES,
    },
  ],
};

/** Fields that are always read-only and cannot be set via the API. */
export const READ_ONLY_FIELDS = ["CreatedAtUtc", "LastUpdatedAtUtc"];

/** Top-level numeric fields where a non-positive value is suspicious. */
export const POSITIVE_NUMBER_FIELDS = ["Amount"];

/**
 * Bundle of rules for a single entity type, suitable for serializing as a
 * resource payload.
 */
export interface TtdEntityFieldRules {
  entityType: TtdEntityType;
  requiredOnCreate: FieldRule[];
  optionalEnums: FieldRule[];
  readOnlyFields: string[];
}

export function getFieldRulesForEntity(entityType: TtdEntityType): TtdEntityFieldRules {
  return {
    entityType,
    requiredOnCreate: REQUIRED_FIELDS_CREATE[entityType] ?? [],
    optionalEnums: OPTIONAL_ENUM_FIELDS[entityType] ?? [],
    readOnlyFields: READ_ONLY_FIELDS,
  };
}
