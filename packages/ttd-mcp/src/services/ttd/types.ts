// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The Trade Desk (TTD) REST API entity type definitions
 * Hand-crafted from TTD REST API reference
 * Base URL: https://api.thetradedesk.com/v3
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type TtdEntityStatus = "Active" | "Inactive" | "Archived";

export type TtdCampaignGoalType =
  | "MaximizeReach"
  | "MaximizeCtcConversions"
  | "MaximizeVtcConversions"
  | "MinimizeCpcv"
  | "MinimizeCpc"
  | "MinimizeCpm"
  | "MaximizeCtcAndVtcConversions"
  | "MinimizeCpa"
  | "MinimizeViewableCpm";

export type TtdBudgetType = "daily" | "lifetime";

export type TtdAdGroupGoalType =
  | "MaximizeReach"
  | "MaximizeCtcConversions"
  | "MaximizeVtcConversions"
  | "MinimizeCpcv"
  | "MinimizeCpc"
  | "MinimizeCpm"
  | "MaximizeCtcAndVtcConversions"
  | "MinimizeCpa"
  | "MinimizeViewableCpm";

export type TtdAdGroupAutoBudgetImpressionPacing = "On" | "Off";

export type TtdCreativeType = "banner" | "video" | "audio" | "native";

// ─── Entity Interfaces ────────────────────────────────────────────────────────

export interface TtdAdvertiser {
  AdvertiserId: string;
  AdvertiserName: string;
  PartnerId: string;
  Description?: string;
  CurrencyCode: string;
  AttributionClickLookbackWindowInSeconds?: number;
  AttributionImpressionLookbackWindowInSeconds?: number;
  ClickDedupWindowInSeconds?: number;
  ConversionDedupWindowInSeconds?: number;
  IndustryCategoryId?: string;
}

export interface TtdBudget {
  Amount: number;
  CurrencyCode: string;
}

export interface TtdCampaignGoal {
  GoalType: TtdCampaignGoalType;
  Value?: number;
}

export interface TtdCampaign {
  CampaignId: string;
  AdvertiserId: string;
  CampaignName: string;
  Description?: string;
  StartDateInclusiveUTC: string;
  EndDateExclusiveUTC?: string;
  Budget?: TtdBudget;
  DailyBudget?: TtdBudget;
  CampaignGoal?: TtdCampaignGoal;
  Availability: "RunOfNetwork" | "Private" | "All";
  CampaignConversionReportingColumns?: string[];
}

export interface TtdAdGroupGoal {
  GoalType: TtdAdGroupGoalType;
  Value?: number;
}

export interface TtdAdGroupBudget {
  Budget?: TtdBudget;
  DailyBudget?: TtdBudget;
  PacingEnabled?: boolean;
  MaxDailySpend?: TtdBudget;
}

export interface TtdInventoryContract {
  ContractId: string;
  ContractName?: string;
}

export interface TtdAdGroupRtbAttributes {
  BudgetSettings?: TtdAdGroupBudget;
  BaseBidCPM?: TtdBudget;
  MaxBidCPM?: TtdBudget;
  CreativeIds?: string[];
  SiteListIds?: string[];
  FoldTargeting?: string;
  Fold?: string;
  InventoryContracts?: TtdInventoryContract[];
}

export interface TtdBidListRef {
  BidListId: string;
  Adjustment?: number;
}

export interface TtdAdGroup {
  AdGroupId: string;
  CampaignId: string;
  AdvertiserId: string;
  AdGroupName: string;
  Description?: string;
  IndustryCategoryId?: string;
  RTBAttributes?: TtdAdGroupRtbAttributes;
  Availability?: string;
  AssociatedBidLists?: TtdBidListRef[];
  AdGroupGoal?: TtdAdGroupGoal;
  AutomaticAdGroupPacing?: boolean;
}

export interface TtdCreative {
  CreativeId: string;
  AdvertiserId: string;
  CreativeName: string;
  Description?: string;
  Width?: number;
  Height?: number;
  CreativeType: TtdCreativeType;
  Url?: string;
  IsActive: boolean;
}

export interface TtdConversionTracker {
  TrackerId: string;
  AdvertiserId: string;
  TrackerName: string;
  Description?: string;
  TrackingTagType: "Image" | "JavaScript";
  AttributionClickLookbackWindowInSeconds?: number;
  AttributionImpressionLookbackWindowInSeconds?: number;
  ClickDedupWindowInSeconds?: number;
  ConversionDedupWindowInSeconds?: number;
  IsActive: boolean;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface TtdPaging {
  PageStartIndex: number;
  PageSize: number;
  TotalFilteredCount: number;
}

export interface TtdPagedResponse<T> {
  Result: T[];
  TotalFilteredCount?: number;
  PageStartIndex?: number;
  PageSize?: number;
}

// ─── Request Body Types ───────────────────────────────────────────────────────

export interface CreateTtdCampaignRequest {
  AdvertiserId: string;
  CampaignName: string;
  StartDateInclusiveUTC: string;
  Description?: string;
  EndDateExclusiveUTC?: string;
  Budget?: TtdBudget;
  DailyBudget?: TtdBudget;
  CampaignGoal?: TtdCampaignGoal;
  Availability?: "RunOfNetwork" | "Private" | "All";
}

export interface UpdateTtdCampaignRequest {
  CampaignId: string;
  CampaignName?: string;
  Description?: string;
  StartDateInclusiveUTC?: string;
  EndDateExclusiveUTC?: string;
  Budget?: TtdBudget;
  DailyBudget?: TtdBudget;
}

export interface CreateTtdAdGroupRequest {
  CampaignId: string;
  AdvertiserId: string;
  AdGroupName: string;
  Description?: string;
  RTBAttributes?: TtdAdGroupRtbAttributes;
  AdGroupGoal?: TtdAdGroupGoal;
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isTtdCampaign(value: unknown): value is TtdCampaign {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).CampaignId === "string" &&
    typeof (value as Record<string, unknown>).AdvertiserId === "string"
  );
}

export function isTtdAdGroup(value: unknown): value is TtdAdGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).AdGroupId === "string" &&
    typeof (value as Record<string, unknown>).CampaignId === "string"
  );
}

export function isTtdCreative(value: unknown): value is TtdCreative {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).CreativeId === "string" &&
    typeof (value as Record<string, unknown>).AdvertiserId === "string"
  );
}

export function isTtdAdvertiser(value: unknown): value is TtdAdvertiser {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).AdvertiserId === "string" &&
    typeof (value as Record<string, unknown>).AdvertiserName === "string"
  );
}

// ─── Error Type ───────────────────────────────────────────────────────────────

export interface TtdApiError {
  Message: string;
  ErrorDetails?: string[];
  StatusCode?: number;
}

export function isTtdApiError(value: unknown): value is TtdApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).Message === "string"
  );
}
