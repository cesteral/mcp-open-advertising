// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TikTok Marketing API v1.3 entity type definitions
 * Hand-crafted from TikTok Marketing API v1.3 reference
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export type TikTokCampaignStatus =
  | "CAMPAIGN_STATUS_ENABLE"
  | "CAMPAIGN_STATUS_DISABLE"
  | "CAMPAIGN_STATUS_DELETE"
  | "CAMPAIGN_STATUS_BUDGET_EXCEED"
  | "CAMPAIGN_STATUS_TIME_DONE"
  | "CAMPAIGN_STATUS_ALL_DONE"
  | "CAMPAIGN_STATUS_IN_PROCESS"
  | "CAMPAIGN_STATUS_NOT_START";

export type TikTokObjectiveType =
  | "REACH"
  | "TRAFFIC"
  | "APP_INSTALLS"
  | "VIDEO_VIEWS"
  | "LEAD_GENERATION"
  | "CONVERSIONS"
  | "CATALOG_SALES"
  | "COMMUNITY_INTERACTION"
  | "PRODUCT_SALES";

export type TikTokBudgetMode =
  | "BUDGET_MODE_DAY"
  | "BUDGET_MODE_TOTAL"
  | "BUDGET_MODE_INFINITE";

export type TikTokAdGroupStatus =
  | "ADGROUP_STATUS_ENABLE"
  | "ADGROUP_STATUS_DISABLE"
  | "ADGROUP_STATUS_DELETE"
  | "ADGROUP_STATUS_BUDGET_EXCEED"
  | "ADGROUP_STATUS_TIME_DONE"
  | "ADGROUP_STATUS_ADGROUP_EXCEED"
  | "ADGROUP_STATUS_BALANCE_EXCEED"
  | "ADGROUP_STATUS_NOT_START"
  | "ADGROUP_STATUS_IN_PROCESS";

export type TikTokOptimizationGoal =
  | "SHOW"
  | "CLICK"
  | "REACH"
  | "VIDEO_VIEW"
  | "LEAD"
  | "APP_INSTALL"
  | "PURCHASE"
  | "ADD_TO_WISHLIST"
  | "REGISTRATION"
  | "FORM"
  | "PAGE_EVENT";

export type TikTokBillingEvent =
  | "CPC"
  | "CPM"
  | "CPV"
  | "OCPC"
  | "OCPM";

export type TikTokAdStatus =
  | "AD_STATUS_ENABLE"
  | "AD_STATUS_DISABLE"
  | "AD_STATUS_DELETE";

// ─── Entity Interfaces ───────────────────────────────────────────────────────

export interface TikTokTargetingInterest {
  interest_category_id: string;
  interest_category_name?: string;
}

export interface TikTokTargeting {
  location_ids?: string[];
  age_groups?: string[];
  gender?: string;
  interests?: TikTokTargetingInterest[];
  device_model_ids?: string[];
  operating_systems?: string[];
  languages?: string[];
}

export interface TikTokCampaign {
  campaign_id: string;
  campaign_name: string;
  advertiser_id: string;
  status: TikTokCampaignStatus;
  objective_type: TikTokObjectiveType;
  budget?: number;
  budget_mode?: TikTokBudgetMode;
  create_time?: string;
  modify_time?: string;
}

export interface TikTokAdGroup {
  adgroup_id: string;
  adgroup_name: string;
  campaign_id: string;
  advertiser_id: string;
  status: TikTokAdGroupStatus;
  budget?: number;
  budget_mode?: TikTokBudgetMode;
  schedule_start_time?: string;
  schedule_end_time?: string;
  optimization_goal?: TikTokOptimizationGoal;
  billing_event?: TikTokBillingEvent;
  bid_price?: number;
  targeting?: TikTokTargeting;
  create_time?: string;
  modify_time?: string;
}

export interface TikTokAd {
  ad_id: string;
  ad_name: string;
  adgroup_id: string;
  campaign_id: string;
  advertiser_id: string;
  status: TikTokAdStatus;
  creative_type?: string;
  call_to_action?: string;
  create_time?: string;
  modify_time?: string;
}

export interface TikTokCreative {
  creative_id: string;
  creative_name: string;
  advertiser_id: string;
  creative_type: string;
  image_ids?: string[];
  video_id?: string;
  ad_name?: string;
  brand_name?: string;
  call_to_action?: string;
  landing_page_url?: string;
  create_time?: string;
  modify_time?: string;
}

export interface TikTokAdAccount {
  advertiser_id: string;
  advertiser_name: string;
  status: string;
  currency: string;
  timezone: string;
  balance?: number;
  create_time?: string;
}

export interface TikTokImage {
  image_id: string;
  size: number;
  width: number;
  height: number;
  format: string;
  url: string;
  create_time?: string;
}

// ─── Response Wrapper Types ──────────────────────────────────────────────────

export interface TikTokPageInfoShape {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}

export interface TikTokEntityPage<T> {
  list: T[];
  page_info: TikTokPageInfoShape;
}

// ─── Request Body Types ──────────────────────────────────────────────────────

export interface CreateTikTokCampaignRequest {
  campaign_name: string;
  advertiser_id: string;
  objective_type: TikTokObjectiveType;
  budget?: number;
  budget_mode?: TikTokBudgetMode;
  status?: TikTokCampaignStatus;
}

export interface UpdateTikTokCampaignRequest {
  campaign_id: string;
  advertiser_id: string;
  campaign_name?: string;
  budget?: number;
  status?: TikTokCampaignStatus;
}

export interface CreateTikTokAdGroupRequest {
  adgroup_name: string;
  campaign_id: string;
  advertiser_id: string;
  optimization_goal: TikTokOptimizationGoal;
  billing_event: TikTokBillingEvent;
  bid_price?: number;
  budget?: number;
  budget_mode?: TikTokBudgetMode;
  schedule_start_time?: string;
  schedule_end_time?: string;
  targeting?: TikTokTargeting;
}

export interface TikTokAdCreativeRef {
  ad_name: string;
  image_ids?: string[];
  video_id?: string;
  call_to_action?: string;
  landing_page_url?: string;
}

export interface CreateTikTokAdRequest {
  adgroup_id: string;
  advertiser_id: string;
  creatives: TikTokAdCreativeRef[];
}

// ─── Type Guards ─────────────────────────────────────────────────────────────

export function isTikTokCampaign(value: unknown): value is TikTokCampaign {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).campaign_id === "string" &&
    typeof (value as Record<string, unknown>).campaign_name === "string"
  );
}

export function isTikTokAdGroup(value: unknown): value is TikTokAdGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).adgroup_id === "string" &&
    typeof (value as Record<string, unknown>).adgroup_name === "string"
  );
}

export function isTikTokAd(value: unknown): value is TikTokAd {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).ad_id === "string" &&
    typeof (value as Record<string, unknown>).ad_name === "string"
  );
}

export function isTikTokAdAccount(value: unknown): value is TikTokAdAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).advertiser_id === "string" &&
    typeof (value as Record<string, unknown>).advertiser_name === "string"
  );
}

// ─── Error Type ──────────────────────────────────────────────────────────────

export interface TikTokApiError {
  code: number;
  message: string;
  request_id?: string;
  data?: unknown;
}

export function isTikTokApiError(value: unknown): value is TikTokApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === "number" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}
