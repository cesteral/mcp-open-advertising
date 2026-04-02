// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Ads API v1 entity type definitions
 * Source: https://marketingapi.snapchat.com/docs/
 * Hand-crafted from Snapchat Ads API v1 reference
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export type SnapchatCampaignStatus = "ACTIVE" | "PAUSED";

export type SnapchatObjective =
  | "BRAND_AWARENESS"
  | "APP_INSTALL"
  | "APP_CONVERSION"
  | "CATALOG_SALES"
  | "ENGAGEMENT"
  | "LEAD_GENERATION"
  | "PROMOTE_PLACES"
  | "PROMOTE_STORIES"
  | "VIDEO_VIEW"
  | "WEB_CONVERSION";

export type SnapchatAdSquadOptimizationGoal =
  | "IMPRESSIONS"
  | "SWIPES"
  | "APP_INSTALLS"
  | "APP_PURCHASES"
  | "VIDEO_VIEWS"
  | "STORY_OPENS"
  | "PIXEL_PAGE_VIEW"
  | "PIXEL_ADD_TO_CART"
  | "PIXEL_PURCHASE";

export type SnapchatBillingEvent = "IMPRESSION" | "SWIPE";

export type SnapchatAdStatus = "ACTIVE" | "PAUSED";

export type SnapchatCreativeType =
  | "SNAP_AD"
  | "APP_INSTALL"
  | "WEB_VIEW"
  | "DEEP_LINK"
  | "AD_TO_LENS"
  | "AD_TO_CALL"
  | "AD_TO_MESSAGE"
  | "PREVIEW"
  | "COMPOSITE"
  | "COLLECTION"
  | "LEAD_GENERATION"
  | "LENS"
  | "LENS_WEB_VIEW"
  | "LENS_APP_INSTALL"
  | "LENS_DEEP_LINK";

// ─── Targeting ──────────────────────────────────────────────────────────────

export interface SnapchatTargeting {
  geos?: Array<{ country_code: string }>;
  demographics?: unknown;
  interests?: unknown;
  devices?: unknown;
}

// ─── Entity Interfaces ──────────────────────────────────────────────────────

export interface SnapchatCampaign {
  id: string;
  name: string;
  status: SnapchatCampaignStatus;
  objective: SnapchatObjective;
  ad_account_id: string;
  start_time?: string;
  end_time?: string;
  daily_budget_micro?: number;
  lifetime_budget_micro?: number;
  created_at: string;
  updated_at: string;
}

/** Ad Squad — Snapchat's term for an ad group */
export interface SnapchatAdSquad {
  id: string;
  name: string;
  status: SnapchatCampaignStatus;
  campaign_id: string;
  ad_account_id: string;
  optimization_goal: SnapchatAdSquadOptimizationGoal;
  billing_event: SnapchatBillingEvent;
  bid_micro?: number;
  daily_budget_micro?: number;
  start_time?: string;
  end_time?: string;
  targeting?: SnapchatTargeting;
  created_at: string;
  updated_at: string;
}

export interface SnapchatAd {
  id: string;
  name: string;
  status: SnapchatAdStatus;
  ad_squad_id: string;
  creative_id: string;
  created_at: string;
  updated_at: string;
}

export interface SnapchatCreative {
  id: string;
  name: string;
  type: SnapchatCreativeType;
  ad_account_id: string;
  headline?: string;
  brand_name?: string;
  call_to_action?: string;
  top_snap_media_id?: string;
  web_view_properties?: unknown;
  preview_creative_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SnapchatMedia {
  id: string;
  name: string;
  ad_account_id: string;
  media_type: "IMAGE" | "VIDEO";
  file_name?: string;
  download_link?: string;
  created_at: string;
  updated_at: string;
}

export interface SnapchatAdAccount {
  id: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

// ─── Response Wrapper Types ──────────────────────────────────────────────────

export interface SnapchatListResponse<T> {
  request_status: string;
  request_id?: string;
  [entityKey: string]: T[] | string | undefined;
}

export interface SnapchatSingleResponse<T> {
  request_status: string;
  request_id?: string;
  [entityKey: string]: T | string | undefined;
}

// ─── Request Body Types ──────────────────────────────────────────────────────

export interface CreateSnapchatCampaignRequest {
  name: string;
  objective: SnapchatObjective;
  ad_account_id: string;
  status?: SnapchatCampaignStatus;
  start_time?: string;
  end_time?: string;
  daily_budget_micro?: number;
  lifetime_budget_micro?: number;
}

export type UpdateSnapchatCampaignRequest = Partial<CreateSnapchatCampaignRequest>;

export interface CreateSnapchatAdSquadRequest {
  name: string;
  campaign_id: string;
  optimization_goal: SnapchatAdSquadOptimizationGoal;
  billing_event: SnapchatBillingEvent;
  bid_micro?: number;
  daily_budget_micro?: number;
  targeting?: SnapchatTargeting;
  start_time?: string;
  end_time?: string;
}

export interface CreateSnapchatAdRequest {
  name: string;
  ad_squad_id: string;
  creative_id: string;
}

// ─── Error Type ──────────────────────────────────────────────────────────────

export interface SnapchatApiError {
  request_status: "FAILED";
  error_code?: number;
  display_message?: string;
  request_id?: string;
}

// ─── Type Guards ─────────────────────────────────────────────────────────────

export function isSnapchatCampaign(value: unknown): value is SnapchatCampaign {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["name"] === "string" &&
    typeof v["status"] === "string" &&
    typeof v["objective"] === "string" &&
    typeof v["ad_account_id"] === "string"
  );
}

export function isSnapchatAdSquad(value: unknown): value is SnapchatAdSquad {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["name"] === "string" &&
    typeof v["status"] === "string" &&
    typeof v["campaign_id"] === "string" &&
    typeof v["ad_account_id"] === "string" &&
    typeof v["optimization_goal"] === "string" &&
    typeof v["billing_event"] === "string"
  );
}

export function isSnapchatAd(value: unknown): value is SnapchatAd {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["name"] === "string" &&
    typeof v["status"] === "string" &&
    typeof v["ad_squad_id"] === "string" &&
    typeof v["creative_id"] === "string"
  );
}

export function isSnapchatCreative(value: unknown): value is SnapchatCreative {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["name"] === "string" &&
    typeof v["type"] === "string" &&
    typeof v["ad_account_id"] === "string"
  );
}

export function isSnapchatAdAccount(value: unknown): value is SnapchatAdAccount {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["name"] === "string" &&
    typeof v["status"] === "string" &&
    typeof v["currency"] === "string" &&
    typeof v["timezone"] === "string" &&
    typeof v["organization_id"] === "string"
  );
}

export function isSnapchatApiError(value: unknown): value is SnapchatApiError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v["request_status"] === "FAILED";
}
