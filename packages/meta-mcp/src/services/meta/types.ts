// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta Marketing API v24.0 entity type definitions
 * Hand-crafted from Meta Marketing API v24.0 reference
 * Source: https://developers.facebook.com/docs/marketing-apis/
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MetaCampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

export type MetaCampaignObjective =
  | "APP_INSTALLS"
  | "BRAND_AWARENESS"
  | "CONVERSIONS"
  | "EVENT_RESPONSES"
  | "LEAD_GENERATION"
  | "LINK_CLICKS"
  | "LOCAL_AWARENESS"
  | "MESSAGES"
  | "OFFER_CLAIMS"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "PRODUCT_CATALOG_SALES"
  | "REACH"
  | "STORE_VISITS"
  | "VIDEO_VIEWS"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_APP_PROMOTION";

export type MetaAdSetStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED";

export type MetaAdSetBillingEvent =
  | "APP_INSTALLS"
  | "CLICKS"
  | "IMPRESSIONS"
  | "LINK_CLICKS"
  | "NONE"
  | "OFFER_CLAIMS"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "VIDEO_VIEWS";

export type MetaAdSetOptimizationGoal =
  | "NONE"
  | "APP_INSTALLS"
  | "BRAND_AWARENESS"
  | "CLICKS"
  | "ENGAGED_USERS"
  | "EVENT_RESPONSES"
  | "IMPRESSIONS"
  | "LEAD_GENERATION"
  | "QUALITY_LEAD"
  | "LINK_CLICKS"
  | "OFFER_CLAIMS"
  | "OFFSITE_CONVERSIONS"
  | "PAGE_ENGAGEMENT"
  | "PAGE_LIKES"
  | "POST_ENGAGEMENT"
  | "REACH"
  | "SOCIAL_IMPRESSIONS"
  | "VALUE"
  | "VIDEO_VIEWS"
  | "VISIT_INSTAGRAM_PROFILE";

export type MetaAdStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DELETED"
  | "ARCHIVED"
  | "WITH_ISSUES"
  | "IN_PROCESS";

// ─── Entity Interfaces ────────────────────────────────────────────────────────

export interface MetaBusiness {
  id: string;
  name: string;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  business?: MetaBusiness;
  created_time?: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: MetaCampaignStatus;
  objective: MetaCampaignObjective;
  account_id: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  budget_remaining?: string;
  created_time?: string;
  updated_time?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: MetaAdSetStatus;
  campaign_id: string;
  account_id: string;
  optimization_goal?: MetaAdSetOptimizationGoal;
  billing_event: MetaAdSetBillingEvent;
  bid_amount?: number;
  bid_strategy?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  end_time?: string;
  targeting?: MetaTargeting;
  created_time?: string;
  updated_time?: string;
}

export interface MetaAdCreativeRef {
  creative_id: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: MetaAdStatus;
  adset_id: string;
  campaign_id: string;
  account_id: string;
  creative?: MetaAdCreativeRef;
  created_time?: string;
  updated_time?: string;
}

export interface MetaCallToActionValue {
  link?: string;
  app_link?: string;
}

export interface MetaCallToAction {
  type: string;
  value?: MetaCallToActionValue;
}

export interface MetaLinkData {
  link: string;
  message?: string;
  name?: string;
  description?: string;
  image_hash?: string;
  call_to_action?: MetaCallToAction;
}

export interface MetaVideoData {
  video_id: string;
  message?: string;
  title?: string;
  image_hash?: string;
  call_to_action?: MetaCallToAction;
}

export interface MetaObjectStorySpec {
  page_id: string;
  link_data?: MetaLinkData;
  video_data?: MetaVideoData;
}

export interface MetaAdCreative {
  id: string;
  name: string;
  account_id: string;
  title?: string;
  body?: string;
  image_url?: string;
  image_hash?: string;
  video_id?: string;
  object_story_spec?: MetaObjectStorySpec;
  call_to_action_type?: string;
  created_time?: string;
}

export interface MetaAudienceDeliveryStatus {
  code: number;
  description: string;
}

export interface MetaCustomAudience {
  id: string;
  name: string;
  description?: string;
  account_id: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  delivery_status?: MetaAudienceDeliveryStatus;
  created_time?: number;
  updated_time?: number;
}

// ─── Targeting ────────────────────────────────────────────────────────────────

export interface MetaRegion {
  key: string;
}

export interface MetaCity {
  key?: string;
}

export interface MetaGeoLocations {
  countries?: string[];
  regions?: MetaRegion[];
  cities?: MetaCity[];
}

export interface MetaTargetingInterest {
  id: string;
  name?: string;
}

export interface MetaTargetingBehavior {
  id: string;
  name?: string;
}

export interface MetaTargetingAudience {
  id: string;
  name?: string;
}

export interface MetaTargeting {
  geo_locations?: MetaGeoLocations;
  age_min?: number;
  age_max?: number;
  genders?: number[];
  interests?: MetaTargetingInterest[];
  behaviors?: MetaTargetingBehavior[];
  custom_audiences?: MetaTargetingAudience[];
  excluded_custom_audiences?: MetaTargetingAudience[];
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export interface MetaInsightAction {
  action_type: string;
  value: string;
}

export interface MetaInsights {
  date_start: string;
  date_stop: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  frequency?: string;
  ctr?: string;
  cpm?: string;
  cpp?: string;
  cpc?: string;
  actions?: MetaInsightAction[];
  conversions?: MetaInsightAction[];
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface MetaCursors {
  before: string;
  after: string;
}

export interface MetaPaging {
  cursors?: MetaCursors;
  next?: string;
  previous?: string;
}

export interface MetaPagedResponse<T> {
  data: T[];
  paging?: MetaPaging;
}

// ─── Request Body Types ───────────────────────────────────────────────────────

export interface CreateMetaCampaignRequest {
  name: string;
  objective: MetaCampaignObjective;
  status?: MetaCampaignStatus;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface CreateMetaAdSetRequest {
  name: string;
  campaign_id: string;
  optimization_goal: MetaAdSetOptimizationGoal;
  billing_event: MetaAdSetBillingEvent;
  bid_amount?: number;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting: MetaTargeting;
  start_time?: string;
  end_time?: string;
  status?: MetaAdSetStatus;
}

export interface CreateMetaAdRequest {
  name: string;
  adset_id: string;
  creative: MetaAdCreativeRef;
  status?: MetaAdStatus;
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isMetaAdAccount(value: unknown): value is MetaAdAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MetaAdAccount).id === "string" &&
    typeof (value as MetaAdAccount).name === "string" &&
    typeof (value as MetaAdAccount).account_id === "string" &&
    typeof (value as MetaAdAccount).account_status === "number" &&
    typeof (value as MetaAdAccount).currency === "string" &&
    typeof (value as MetaAdAccount).timezone_name === "string"
  );
}

export function isMetaCampaign(value: unknown): value is MetaCampaign {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MetaCampaign).id === "string" &&
    typeof (value as MetaCampaign).name === "string" &&
    typeof (value as MetaCampaign).status === "string" &&
    typeof (value as MetaCampaign).objective === "string" &&
    typeof (value as MetaCampaign).account_id === "string"
  );
}

export function isMetaAdSet(value: unknown): value is MetaAdSet {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MetaAdSet).id === "string" &&
    typeof (value as MetaAdSet).name === "string" &&
    typeof (value as MetaAdSet).status === "string" &&
    typeof (value as MetaAdSet).campaign_id === "string" &&
    typeof (value as MetaAdSet).account_id === "string" &&
    typeof (value as MetaAdSet).billing_event === "string"
  );
}

export function isMetaAd(value: unknown): value is MetaAd {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MetaAd).id === "string" &&
    typeof (value as MetaAd).name === "string" &&
    typeof (value as MetaAd).status === "string" &&
    typeof (value as MetaAd).adset_id === "string" &&
    typeof (value as MetaAd).campaign_id === "string" &&
    typeof (value as MetaAd).account_id === "string"
  );
}

export function isMetaAdCreative(value: unknown): value is MetaAdCreative {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MetaAdCreative).id === "string" &&
    typeof (value as MetaAdCreative).name === "string" &&
    typeof (value as MetaAdCreative).account_id === "string"
  );
}

export function isMetaCustomAudience(value: unknown): value is MetaCustomAudience {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MetaCustomAudience).id === "string" &&
    typeof (value as MetaCustomAudience).name === "string" &&
    typeof (value as MetaCustomAudience).account_id === "string" &&
    typeof (value as MetaCustomAudience).subtype === "string"
  );
}
