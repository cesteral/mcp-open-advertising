// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads REST API v23 entity type definitions
 * Hand-crafted from Google Ads API v23 reference
 * Source: https://developers.google.com/google-ads/api/reference/rpc/v23/
 *
 * Note: Google Ads API uses resource names as IDs:
 * customers/{customerId}/campaigns/{campaignId}
 * Entity data comes via GAQL (Google Ads Query Language) rows.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type GoogleAdsCampaignStatus =
  | "ENABLED"
  | "PAUSED"
  | "REMOVED"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type GoogleAdsAdGroupStatus =
  | "ENABLED"
  | "PAUSED"
  | "REMOVED"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type GoogleAdsAdStatus =
  | "ENABLED"
  | "PAUSED"
  | "REMOVED"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type GoogleAdsCriterionStatus =
  | "ENABLED"
  | "PAUSED"
  | "REMOVED"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type GoogleAdsAdvertisingChannelType =
  | "SEARCH"
  | "DISPLAY"
  | "SHOPPING"
  | "HOTEL"
  | "VIDEO"
  | "MULTI_CHANNEL"
  | "LOCAL"
  | "SMART"
  | "PERFORMANCE_MAX"
  | "LOCAL_SERVICES"
  | "DISCOVERY"
  | "TRAVEL"
  | "DEMAND_GEN"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type GoogleAdsBiddingStrategyType =
  | "MANUAL_CPC"
  | "MANUAL_CPM"
  | "MANUAL_CPV"
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "TARGET_CPA"
  | "TARGET_CPM"
  | "TARGET_IMPRESSION_SHARE"
  | "TARGET_OUTRANK_SHARE"
  | "TARGET_ROAS"
  | "TARGET_SPEND"
  | "PERCENT_CPC"
  | "COMMISSION"
  | "ENHANCED_CPC"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type GoogleAdsKeywordMatchType =
  | "BROAD"
  | "EXACT"
  | "PHRASE"
  | "UNKNOWN"
  | "UNSPECIFIED";

export type GoogleAdsAdType =
  | "TEXT_AD"
  | "EXPANDED_TEXT_AD"
  | "CALL_ONLY_AD"
  | "EXPANDED_DYNAMIC_SEARCH_AD"
  | "HOTEL_AD"
  | "SHOPPING_SMART_AD"
  | "SHOPPING_PRODUCT_AD"
  | "VIDEO_AD"
  | "GMAIL_AD"
  | "IMAGE_AD"
  | "RESPONSIVE_SEARCH_AD"
  | "LEGACY_RESPONSIVE_DISPLAY_AD"
  | "APP_AD"
  | "LEGACY_APP_INSTALL_AD"
  | "RESPONSIVE_DISPLAY_AD"
  | "LOCAL_AD"
  | "HTML5_UPLOAD_AD"
  | "DYNAMIC_HTML5_AD"
  | "APP_ENGAGEMENT_AD"
  | "SHOPPING_COMPARISON_LISTING_AD"
  | "VIDEO_BUMPER_AD"
  | "VIDEO_NON_SKIPPABLE_IN_STREAM_AD"
  | "VIDEO_OUTSTREAM_AD"
  | "VIDEO_RESPONSIVE_AD"
  | "UNKNOWN"
  | "UNSPECIFIED";

// ─── GAQL Resource Row Types ──────────────────────────────────────────────────

/** Base shape for a GAQL result row */
export interface GoogleAdsQueryRow {
  campaign?: GoogleAdsCampaignRow;
  ad_group?: GoogleAdsAdGroupRow;
  ad_group_ad?: GoogleAdsAdGroupAdRow;
  ad_group_criterion?: GoogleAdsAdGroupCriterionRow;
  campaign_budget?: GoogleAdsCampaignBudgetRow;
  asset?: GoogleAdsAssetRow;
  customer?: GoogleAdsCustomerRow;
  metrics?: GoogleAdsMetrics;
  segments?: GoogleAdsSegments;
}

// ─── Entity Field Sub-Types ───────────────────────────────────────────────────

export interface GoogleAdsCampaignRow {
  resource_name: string;
  id?: string;
  name?: string;
  status?: GoogleAdsCampaignStatus;
  advertising_channel_type?: GoogleAdsAdvertisingChannelType;
  bidding_strategy_type?: GoogleAdsBiddingStrategyType;
  campaign_budget?: string;
  start_date?: string;
  end_date?: string;
}

export interface GoogleAdsAdGroupRow {
  resource_name: string;
  id?: string;
  name?: string;
  status?: GoogleAdsAdGroupStatus;
  campaign?: string;
  type?: string;
  base_ad_group?: string;
  cpc_bid_micros?: string;
}

export interface GoogleAdsAdGroupAdRow {
  resource_name: string;
  status?: GoogleAdsAdStatus;
  ad_group?: string;
  ad?: GoogleAdsAdRow;
}

export interface GoogleAdsAdRow {
  resource_name?: string;
  id?: string;
  name?: string;
  type?: GoogleAdsAdType;
  final_urls?: string[];
  responsive_search_ad?: GoogleAdsResponsiveSearchAd;
  expanded_text_ad?: GoogleAdsExpandedTextAd;
}

export interface GoogleAdsResponsiveSearchAd {
  headlines?: GoogleAdsAdTextAsset[];
  descriptions?: GoogleAdsAdTextAsset[];
}

export interface GoogleAdsExpandedTextAd {
  headline_part1?: string;
  headline_part2?: string;
  headline_part3?: string;
  description?: string;
  description2?: string;
}

export interface GoogleAdsAdTextAsset {
  text: string;
  pinned_field?: string;
}

export interface GoogleAdsAdGroupCriterionRow {
  resource_name: string;
  ad_group?: string;
  status?: GoogleAdsCriterionStatus;
  quality_info?: GoogleAdsQualityInfo;
  type?:
    | "KEYWORD"
    | "PLACEMENT"
    | "MOBILE_APP_CATEGORY"
    | "MOBILE_APPLICATION"
    | "DEVICE"
    | "WEBPAGE"
    | "AGE_RANGE"
    | "GENDER"
    | "INCOME_RANGE"
    | "PARENTAL_STATUS"
    | "YOUTUBE_VIDEO"
    | "YOUTUBE_CHANNEL"
    | "USER_LIST"
    | "PROXIMITY"
    | "TOPIC"
    | "LISTING_SCOPE"
    | "LANGUAGE"
    | "IP_BLOCK"
    | "CONTENT_LABEL"
    | "CARRIER"
    | "USER_INTEREST"
    | "OPERATING_SYSTEM_VERSION"
    | "APP_PAYMENT_MODEL"
    | "MOBILE_DEVICE"
    | "CUSTOM_AFFINITY"
    | "CUSTOM_INTENT"
    | "LOCATION_GROUP"
    | "CUSTOM_AUDIENCE"
    | "COMBINED_AUDIENCE"
    | "KEYWORD_THEME"
    | "AUDIENCE"
    | "NEGATIVE_KEYWORD_LIST"
    | "UNKNOWN"
    | "UNSPECIFIED";
  keyword?: GoogleAdsKeyword;
  cpc_bid_micros?: string;
}

export interface GoogleAdsKeyword {
  text?: string;
  match_type?: GoogleAdsKeywordMatchType;
}

export interface GoogleAdsQualityInfo {
  quality_score?: number;
  creative_quality_score?: string;
  post_click_quality_score?: string;
  search_predicted_ctr?: string;
}

export interface GoogleAdsCampaignBudgetRow {
  resource_name: string;
  id?: string;
  name?: string;
  amount_micros?: string;
  status?: string;
  delivery_method?: string;
  explicitly_shared?: boolean;
}

export interface GoogleAdsAssetRow {
  resource_name: string;
  id?: string;
  name?: string;
  type?: string;
  text_asset?: GoogleAdsTextAsset;
  image_asset?: GoogleAdsImageAsset;
  youtube_video_asset?: GoogleAdsYouTubeVideoAsset;
}

export interface GoogleAdsTextAsset {
  text?: string;
}

export interface GoogleAdsImageAsset {
  full_size?: GoogleAdsImageDimension;
  file_size?: string;
  mime_type?: string;
}

export interface GoogleAdsImageDimension {
  url?: string;
  width_pixels?: number;
  height_pixels?: number;
}

export interface GoogleAdsYouTubeVideoAsset {
  youtube_video_id?: string;
  youtube_video_title?: string;
}

export interface GoogleAdsCustomerRow {
  resource_name: string;
  id?: string;
  descriptive_name?: string;
  currency_code?: string;
  time_zone?: string;
  manager?: boolean;
}

// ─── Metrics and Segments ─────────────────────────────────────────────────────

export interface GoogleAdsMetrics {
  impressions?: string;
  clicks?: string;
  cost_micros?: string;
  conversions?: number;
  conversions_value?: number;
  ctr?: number;
  average_cpc?: string;
  average_cpm?: string;
  cost_per_conversion?: string;
  all_conversions?: number;
}

export interface GoogleAdsSegments {
  date?: string;
  week?: string;
  month?: string;
  quarter?: string;
  year?: number;
  day_of_week?: string;
  device?: string;
  click_type?: string;
  ad_network_type?: string;
}

// ─── Request Body Types ───────────────────────────────────────────────────────

export interface CreateGoogleAdsCampaignRequest {
  name: string;
  status?: GoogleAdsCampaignStatus;
  advertising_channel_type: GoogleAdsAdvertisingChannelType;
  campaign_budget: string;
  start_date?: string;
  end_date?: string;
  manual_cpc?: Record<string, unknown>;
  maximize_conversions?: Record<string, unknown>;
  target_cpa?: Record<string, unknown>;
  target_roas?: Record<string, unknown>;
}

export interface CreateGoogleAdsAdGroupRequest {
  name: string;
  campaign: string;
  status?: GoogleAdsAdGroupStatus;
  cpc_bid_micros?: string;
  type?: string;
}

export interface CreateGoogleAdsCampaignBudgetRequest {
  name: string;
  amount_micros: string;
  delivery_method?: string;
  explicitly_shared?: boolean;
}

// ─── GAQL Search Request/Response ────────────────────────────────────────────

export interface GoogleAdsGaqlRequest {
  query: string;
  pageToken?: string;
  pageSize?: number;
}

export interface GoogleAdsGaqlResponse {
  results: GoogleAdsQueryRow[];
  nextPageToken?: string;
  totalResultsCount?: string;
}

// ─── Mutate Response Types ────────────────────────────────────────────────────

export interface GoogleAdsMutateResponse {
  results: GoogleAdsMutateResult[];
  partialFailureError?: GoogleAdsStatus;
}

export interface GoogleAdsMutateResult {
  resourceName?: string;
  campaign?: GoogleAdsCampaignRow;
  adGroup?: GoogleAdsAdGroupRow;
  adGroupAd?: GoogleAdsAdGroupAdRow;
  adGroupCriterion?: GoogleAdsAdGroupCriterionRow;
  campaignBudget?: GoogleAdsCampaignBudgetRow;
}

export interface GoogleAdsStatus {
  code?: number;
  message?: string;
  details?: unknown[];
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isGoogleAdsCampaignRow(value: unknown): value is GoogleAdsCampaignRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "resource_name" in value &&
    typeof (value as GoogleAdsCampaignRow).resource_name === "string"
  );
}

export function isGoogleAdsAdGroupRow(value: unknown): value is GoogleAdsAdGroupRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "resource_name" in value &&
    typeof (value as GoogleAdsAdGroupRow).resource_name === "string"
  );
}

export function isGoogleAdsQueryRow(value: unknown): value is GoogleAdsQueryRow {
  return typeof value === "object" && value !== null;
}
