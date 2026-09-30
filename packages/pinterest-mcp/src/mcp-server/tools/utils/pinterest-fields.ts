// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Ads v5 field facts used by `pinterest_validate_entity` and the
 * write tools' descriptions.
 *
 * Source: Pinterest REST API OpenAPI **v5.28.0**
 * (`pinterest/api-description`, `v5/openapi.json`). Each constant names the
 * schema it was copied from, and every enum is checked at compile time
 * against `src/generated/types.ts` (see the `SameAs` checks at the end), so a
 * regeneration that adds or removes a value fails `tsc` until this file
 * follows. The arrays stay hand-written because the runtime needs values and
 * the generated file has only types.
 *
 * Required fields are those of the batch create items (`CampaignCreateItem`,
 * `AdGroupCreateRequest`, `AdCreateRequest`). `PinCreate` marks nothing
 * required, so the Pin fields below are only recommended.
 */

import type { FieldRule, ValidationIssue } from "@cesteral/shared";
import type { PinterestEntityType } from "./entity-mapping.js";
import type { components } from "../../../generated/types.js";

/** `ObjectiveType` */
export const OBJECTIVE_TYPES = [
  "AWARENESS",
  "CONSIDERATION",
  "WEB_CONVERSION",
  "CATALOG_SALES",
  "VIDEO_COMPLETION",
  "SALES",
  "APP_INSTALL",
  "CTV_CONSIDERATION",
] as const;

/** `EntityStatus` */
export const ENTITY_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT", "DELETED_DRAFT"] as const;

/** `ActionType` (an ad group's `billable_event`) */
export const BILLABLE_EVENTS = ["CLICKTHROUGH", "IMPRESSION", "VIDEO_V_50_MRC"] as const;

/** `BudgetType` */
export const BUDGET_TYPES = ["DAILY", "LIFETIME", "CBO_ADGROUP"] as const;

/** `BidStrategyType` (nullable in the spec; null is not a value a caller sends) */
export const BID_STRATEGY_TYPES = ["AUTOMATIC_BID", "MAX_BID", "TARGET_AVG"] as const;

/** `PacingDeliveryType` */
export const PACING_DELIVERY_TYPES = ["STANDARD", "ACCELERATED"] as const;

/** `PlacementGroupType` */
export const PLACEMENT_GROUPS = ["ALL", "SEARCH", "BROWSE", "OTHER"] as const;

/** `CreativeType`. SHOP_THE_PIN is deprecated in favour of COLLECTION. */
export const CREATIVE_TYPES = [
  "REGULAR",
  "VIDEO",
  "SHOPPING",
  "CAROUSEL",
  "MAX_VIDEO",
  "SHOP_THE_PIN",
  "COLLECTION",
  "IDEA",
  "SHOWCASE",
  "QUIZ",
  "COLLAGE",
  "MAX_WIDTH_REGULAR_COLLECTION",
  "MAX_WIDTH_VIDEO_COLLECTION",
  "APP",
] as const;

/** `CustomizableCTAType` */
export const CTA_TYPES = [
  "GET_OFFER",
  "LEARN_MORE",
  "ORDER_NOW",
  "SHOP_NOW",
  "SIGN_UP",
  "SUBSCRIBE",
  "BUY_NOW",
  "CONTACT_US",
  "GET_QUOTE",
  "VISIT_SITE",
  "APPLY_NOW",
  "BOOK_NOW",
  "REQUEST_DEMO",
  "REGISTER_NOW",
  "FIND_A_DEALER",
  "ADD_TO_CART",
  "WATCH_NOW",
  "READ_MORE",
  "BUY_TICKETS",
  "DONATE_NOW",
  "DOWNLOAD",
  "EXPLORE_MORE",
  "FIND_A_LOCATION",
  "FIND_RETAILERS",
  "GET_DEAL",
  "GET_RECIPE",
  "GET_SHOWTIMES",
  "ON_SALE",
  "PLAY_GAME",
  "TRY_IT",
  "TAKE_A_PEEK",
] as const;

/** `TargetingSpec` property names. */
export const TARGETING_SPEC_KEYS = [
  "AGE_BUCKET",
  "APPTYPE",
  "AUDIENCE_EXCLUDE",
  "AUDIENCE_INCLUDE",
  "GENDER",
  "GEO",
  "GEO_EXCLUDE",
  "INTEREST",
  "LOCALE",
  "LOCATION",
  "LOCATION_EXCLUDE",
  "MAXIMUM_AGE",
  "MINIMUM_AGE",
  "SHOPPING_RETARGETING",
  "TARGETING_STRATEGY",
] as const;

/** `TargetingSpec` keys whose value is a string rather than an array. */
const SCALAR_TARGETING_KEYS = new Set<string>(["MAXIMUM_AGE", "MINIMUM_AGE"]);

/**
 * `PinMediaSource` variants: `source_type` → the variant's required fields
 * besides `source_type` (`PinMediaSourceImageBase64`, `…ImageURL`, `…VideoID`,
 * `…ImagesBase64`, `…ImagesURL`, `…PinURL`).
 */
const PIN_MEDIA_SOURCE_REQUIRED = {
  image_base64: ["content_type", "data"],
  image_url: ["url"],
  video_id: ["media_id"],
  multiple_image_base64: ["items"],
  multiple_image_urls: ["items"],
  pin_url: [],
} as const;

/** `PinMediaSource` variants, by `source_type`. */
export const PIN_MEDIA_SOURCES: Readonly<Record<string, readonly string[]>> =
  PIN_MEDIA_SOURCE_REQUIRED;

/** Required create fields, per entity type. Enum-valued ones carry their values. */
export const REQUIRED_CREATE_FIELDS: Record<PinterestEntityType, FieldRule[]> = {
  campaign: [
    { field: "name", expectedType: "string" },
    { field: "objective_type", expectedType: "string", suggestedValues: OBJECTIVE_TYPES },
  ],
  adGroup: [
    { field: "name", expectedType: "string" },
    { field: "campaign_id", expectedType: "string" },
    { field: "billable_event", expectedType: "string", suggestedValues: BILLABLE_EVENTS },
  ],
  ad: [
    { field: "ad_group_id", expectedType: "string" },
    { field: "creative_type", expectedType: "string", suggestedValues: CREATIVE_TYPES },
    { field: "pin_id", expectedType: "string" },
  ],
  // `PinCreate` requires nothing; see RECOMMENDED_PIN_FIELDS.
  creative: [],
};

/** Fields a Pin is created with in practice. Missing ones are warnings, not errors. */
export const RECOMMENDED_PIN_FIELDS = ["board_id", "media_source"] as const;

/** Optional enum-valued fields, checked whenever present, in either mode. */
export const OPTIONAL_ENUM_FIELDS: Record<PinterestEntityType, FieldRule[]> = {
  campaign: [{ field: "status", suggestedValues: ENTITY_STATUSES }],
  adGroup: [
    { field: "status", suggestedValues: ENTITY_STATUSES },
    { field: "budget_type", suggestedValues: BUDGET_TYPES },
    { field: "bid_strategy_type", suggestedValues: BID_STRATEGY_TYPES },
    { field: "pacing_delivery_type", suggestedValues: PACING_DELIVERY_TYPES },
    { field: "placement_group", suggestedValues: PLACEMENT_GROUPS },
  ],
  ad: [
    { field: "status", suggestedValues: ENTITY_STATUSES },
    { field: "customizable_cta_type", suggestedValues: CTA_TYPES },
  ],
  creative: [],
};

/**
 * Fields in the GET response that neither the create nor the update schema
 * accepts, plus `id` (the tools take the id as `entityId`).
 */
export const READ_ONLY_FIELDS: Record<PinterestEntityType, readonly string[]> = {
  campaign: ["id", "created_time", "updated_time", "summary_status", "type", "is_carting"],
  adGroup: [
    "id",
    "ad_account_id",
    "created_time",
    "updated_time",
    "summary_status",
    "type",
    "conversion_learning_mode_type",
    "dca_assets",
  ],
  ad: [
    "id",
    "ad_account_id",
    "campaign_id",
    "created_time",
    "updated_time",
    "summary_status",
    "review_status",
    "rejected_reasons",
    "rejection_labels",
    "type",
    "carting_platform_type",
    "carting_products",
  ],
  creative: [
    "id",
    "created_at",
    "media",
    "creative_type",
    "board_owner",
    "has_been_promoted",
    "is_owner",
    "is_product",
    "is_standard",
    "pin_metrics",
  ],
};

/**
 * Fields the spec says only a draft can change on update: a campaign's
 * `objective_type`, an ad group's `billable_event`, an ad's `pin_id`.
 */
const DRAFT_ONLY_UPDATE_FIELDS: Partial<Record<PinterestEntityType, string>> = {
  campaign: "objective_type",
  adGroup: "billable_event",
  ad: "pin_id",
};

/** Integer micro-currency money fields, per entity type. */
const MONEY_FIELDS: Record<PinterestEntityType, readonly string[]> = {
  campaign: ["daily_spend_cap", "lifetime_spend_cap", "default_ad_group_budget_in_micro_currency"],
  adGroup: ["budget_in_micro_currency", "bid_in_micro_currency"],
  ad: [],
  creative: [],
};

/** Integer Unix-second time fields. */
const TIME_FIELDS: Record<PinterestEntityType, readonly string[]> = {
  campaign: ["start_time", "end_time"],
  adGroup: ["start_time", "end_time"],
  ad: [],
  creative: [],
};

const ONE_UNIT_IN_MICROS = 1_000_000;
/** Seconds since the epoch stay under this until the year 5138; milliseconds pass it in 1973. */
const MAX_PLAUSIBLE_UNIX_SECONDS = 1e11;

/**
 * Checks beyond required fields and read-only fields: integer micro-currency,
 * integer Unix-second times, `targeting_spec` keys, the Pin `media_source`
 * shape, and fields only a draft can change. Pure.
 */
export function pinterestFieldIssues(
  entityType: PinterestEntityType,
  mode: "create" | "update",
  data: Record<string, unknown>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of MONEY_FIELDS[entityType]) {
    const value = data[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      issues.push({
        field,
        code: "wrongType",
        message: `Field "${field}" must be a non-negative integer in micro-currency (50.00 = 50000000)`,
        severity: "error",
      });
    } else if (value > 0 && value < ONE_UNIT_IN_MICROS && field !== "bid_in_micro_currency") {
      issues.push({
        field,
        code: "invalidValue",
        message: `Field "${field}" is ${value}, which is ${value / ONE_UNIT_IN_MICROS} in the account currency. Pinterest money fields are micro-currency: 50.00 is 50000000.`,
        severity: "warning",
      });
    }
  }

  for (const field of TIME_FIELDS[entityType]) {
    const value = data[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      issues.push({
        field,
        code: "wrongType",
        message: `Field "${field}" must be an integer Unix timestamp in seconds (2026-04-01 00:00 UTC = 1775001600)`,
        severity: "error",
      });
    } else if (value > MAX_PLAUSIBLE_UNIX_SECONDS) {
      issues.push({
        field,
        code: "invalidValue",
        message: `Field "${field}" looks like milliseconds. Pinterest expects Unix seconds.`,
        severity: "error",
      });
    }
  }

  if (entityType === "adGroup" && data.targeting_spec !== undefined) {
    issues.push(...targetingSpecIssues(data.targeting_spec));
  }

  if (entityType === "creative") {
    if (mode === "create") {
      for (const field of RECOMMENDED_PIN_FIELDS) {
        if (data[field] === undefined || data[field] === null) {
          issues.push({
            field,
            code: "missing",
            message: `A Pin is normally created with "${field}"`,
            severity: "warning",
          });
        }
      }
    }
    if (data.media_source !== undefined) issues.push(...mediaSourceIssues(data.media_source));
  }

  const draftOnly = DRAFT_ONLY_UPDATE_FIELDS[entityType];
  if (mode === "update" && draftOnly && draftOnly in data) {
    issues.push({
      field: draftOnly,
      code: "custom",
      message: `Pinterest only lets a draft ${entityType} change "${draftOnly}"`,
      severity: "warning",
    });
  }

  return issues;
}

function targetingSpecIssues(spec: unknown): ValidationIssue[] {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    return [
      {
        field: "targeting_spec",
        code: "wrongType",
        message: 'Field "targeting_spec" must be an object such as {"LOCATION": ["US"]}',
        severity: "error",
      },
    ];
  }
  const known = TARGETING_SPEC_KEYS as readonly string[];
  const issues: ValidationIssue[] = [];
  for (const [key, value] of Object.entries(spec)) {
    if (!known.includes(key)) {
      const upper = key.toUpperCase();
      issues.push({
        field: `targeting_spec.${key}`,
        code: "invalidValue",
        message: known.includes(upper)
          ? `targeting_spec keys are UPPERCASE: use "${upper}"`
          : `"${key}" is not a TargetingSpec key`,
        suggestedValues: known.includes(upper) ? [upper] : [...known],
        severity: known.includes(upper) ? "error" : "warning",
      });
      continue;
    }
    const wantsArray = !SCALAR_TARGETING_KEYS.has(key);
    if (wantsArray !== Array.isArray(value)) {
      issues.push({
        field: `targeting_spec.${key}`,
        code: "wrongType",
        message: wantsArray
          ? `targeting_spec.${key} must be an array, e.g. ["…"]`
          : `targeting_spec.${key} must be a string such as "25"`,
        severity: "error",
      });
    }
  }
  return issues;
}

function mediaSourceIssues(source: unknown): ValidationIssue[] {
  const sourceTypes = Object.keys(PIN_MEDIA_SOURCES);
  const sourceType =
    typeof source === "object" && source !== null
      ? (source as Record<string, unknown>).source_type
      : undefined;
  if (typeof sourceType !== "string" || !(sourceType in PIN_MEDIA_SOURCES)) {
    return [
      {
        field: "media_source.source_type",
        code: "invalidValue",
        message: `media_source must be an object whose source_type is one of ${sourceTypes.join(", ")}`,
        suggestedValues: sourceTypes,
        severity: "error",
      },
    ];
  }
  const record = source as Record<string, unknown>;
  return PIN_MEDIA_SOURCES[sourceType]!.filter(
    (field) => record[field] === undefined || record[field] === null
  ).map((field) => ({
    field: `media_source.${field}`,
    code: "missing" as const,
    message: `media_source with source_type "${sourceType}" requires "${field}"`,
    severity: "error" as const,
  }));
}

// ─── Compile-time checks against the generated OpenAPI types ──────────────
// Each line fails to compile when a hand-written list and the spec disagree in
// either direction: a value missing here, or one the spec no longer has.

type Schemas = components["schemas"];
type SameAs<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Values<T extends readonly unknown[]> = T[number];

const _objectiveTypes: SameAs<Values<typeof OBJECTIVE_TYPES>, Schemas["ObjectiveType"]> = true;
const _entityStatuses: SameAs<Values<typeof ENTITY_STATUSES>, Schemas["EntityStatus"]> = true;
const _billableEvents: SameAs<Values<typeof BILLABLE_EVENTS>, Schemas["ActionType"]> = true;
const _budgetTypes: SameAs<Values<typeof BUDGET_TYPES>, Schemas["BudgetType"]> = true;
const _bidStrategyTypes: SameAs<
  Values<typeof BID_STRATEGY_TYPES>,
  NonNullable<Schemas["BidStrategyType"]>
> = true;
const _pacingDeliveryTypes: SameAs<
  Values<typeof PACING_DELIVERY_TYPES>,
  Schemas["PacingDeliveryType"]
> = true;
const _placementGroups: SameAs<
  Values<typeof PLACEMENT_GROUPS>,
  Schemas["PlacementGroupType"]
> = true;
const _creativeTypes: SameAs<Values<typeof CREATIVE_TYPES>, Schemas["CreativeType"]> = true;
const _ctaTypes: SameAs<
  Values<typeof CTA_TYPES>,
  NonNullable<Schemas["CustomizableCTAType"]>
> = true;
const _targetingSpecKeys: SameAs<
  Values<typeof TARGETING_SPEC_KEYS>,
  keyof Schemas["TargetingSpec"]
> = true;
const _pinMediaSourceTypes: SameAs<
  keyof typeof PIN_MEDIA_SOURCE_REQUIRED,
  Schemas["PinMediaSource"]["source_type"]
> = true;
void [
  _objectiveTypes,
  _entityStatuses,
  _billableEvents,
  _budgetTypes,
  _bidStrategyTypes,
  _pacingDeliveryTypes,
  _placementGroups,
  _creativeTypes,
  _ctaTypes,
  _targetingSpecKeys,
  _pinMediaSourceTypes,
];
