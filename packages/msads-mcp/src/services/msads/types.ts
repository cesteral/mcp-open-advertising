// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Microsoft Advertising REST API v13 entity type definitions
 * Hand-crafted from Microsoft Advertising API v13 reference
 * Source: https://learn.microsoft.com/en-us/advertising/bingads-13/campaign-management-service/
 *
 * Note: Microsoft Advertising API uses verb-based POST endpoints:
 * e.g., POST /CampaignManagement/v13/Campaigns/GetCampaignsByAccountId
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MsAdsCampaignStatus =
  | "Active"
  | "BudgetPaused"
  | "BudgetAndManualPaused"
  | "Paused"
  | "Suspended"
  | "Deleted";

export type MsAdsCampaignType =
  | "Search"
  | "Shopping"
  | "DynamicSearchAds"
  | "Audience"
  | "Hotel"
  | "PerformanceMax"
  | "Video";

export type MsAdsBudgetMode =
  | "DailyBudgetAccelerated"
  | "DailyBudgetStandard"
  | "MonthlyBudgetSpendUntilDepleted";

export type MsAdsAdGroupStatus = "Active" | "Expired" | "Paused" | "Deleted";

export type MsAdsAdStatus = "Active" | "Paused" | "Deleted";

export type MsAdsKeywordStatus = "Active" | "Paused" | "Deleted" | "Inactive";

export type MsAdsMatchType = "Exact" | "Phrase" | "Broad";

export type MsAdsAdExtensionType =
  | "SiteLinksAdExtension"
  | "LocationAdExtension"
  | "CallAdExtension"
  | "ImageAdExtension"
  | "AppAdExtension"
  | "ReviewAdExtension"
  | "CalloutAdExtension"
  | "StructuredSnippetAdExtension"
  | "PriceAdExtension"
  | "ActionAdExtension"
  | "PromotionAdExtension"
  | "FilterLinkAdExtension";

// ─── Shared primitives ────────────────────────────────────────────────────────

export interface MsAdsDate {
  Day: number;
  Month: number;
  Year: number;
}

export interface MsAdsBid {
  Amount?: number;
}

export interface MsAdsKeyValuePair {
  Key: string;
  Value: string;
}

// ─── Bidding schemes ──────────────────────────────────────────────────────────

export interface MsAdsManualCpcBidding {
  MaxCpc?: MsAdsBid;
}

export interface MsAdsMaxCpcBidding {
  MaxCpc: MsAdsBid;
}

export interface MsAdsTargetCpaBidding {
  TargetCpa: number;
  MaxCpc?: MsAdsBid;
}

export interface MsAdsTargetRoasBidding {
  TargetRoas?: number;
  MaxCpc?: MsAdsBid;
  MinCpc?: MsAdsBid;
}

export interface MsAdsBiddingScheme {
  Type: string;
  ManualCpc?: MsAdsManualCpcBidding;
  MaxCpc?: MsAdsMaxCpcBidding;
  TargetCpa?: MsAdsTargetCpaBidding;
  TargetRoas?: MsAdsTargetRoasBidding;
  EnhancedCpc?: Record<string, unknown>;
}

// ─── Ad sub-types ─────────────────────────────────────────────────────────────

export interface MsAdsAdDescription {
  Text: string;
  PinnedField?: string;
}

export interface MsAdsAdHeadline {
  Text: string;
  PinnedField?: string;
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface MsAdsSchedule {
  Day: "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
  StartHour: number;
  StartMinute: number;
  EndHour: number;
  EndMinute: number;
}

// ─── Entity interfaces ────────────────────────────────────────────────────────

export interface MsAdsCampaign {
  Id: number;
  Name: string;
  Status: MsAdsCampaignStatus;
  BudgetType?: MsAdsBudgetMode;
  DailyBudget?: number;
  MonthlyBudget?: number;
  BudgetId?: number;
  CampaignType?: MsAdsCampaignType;
  TimeZone: string;
  Languages?: string[];
  TrackingUrlTemplate?: string;
  ForwardCompatibilityMap?: MsAdsKeyValuePair[];
}

export interface MsAdsAdGroup {
  Id: number;
  Name: string;
  Status: MsAdsAdGroupStatus;
  CampaignId?: number;
  StartDate?: MsAdsDate;
  EndDate?: MsAdsDate;
  BiddingScheme?: MsAdsBiddingScheme;
  Network?: "OwnedAndOperatedAndSyndicatedSearch" | "OwnedAndOperatedOnly" | "SyndicatedSearchOnly" | "InHousePromotion";
  Language?: string;
  TrackingUrlTemplate?: string;
}

export interface MsAdsAd {
  Id?: number;
  Type: string;
  Status: MsAdsAdStatus;
  AdGroupId?: number;
  FinalUrls?: string[];
  TrackingUrlTemplate?: string;
  TitlePart1?: string;
  TitlePart2?: string;
  TitlePart3?: string;
  Text?: string;
  TextPart2?: string;
  Path1?: string;
  Path2?: string;
  Descriptions?: MsAdsAdDescription[];
  Headlines?: MsAdsAdHeadline[];
}

export interface MsAdsKeyword {
  Id?: number;
  Text: string;
  MatchType: MsAdsMatchType;
  Status: MsAdsKeywordStatus;
  Bid?: MsAdsBid;
  FinalUrls?: string[];
  TrackingUrlTemplate?: string;
  AdGroupId?: number;
}

export interface MsAdsBudget {
  Id: number;
  Name: string;
  Amount: number;
  BudgetType: MsAdsBudgetMode;
  AssociationCount?: number;
}

export interface MsAdsAdExtension {
  Id?: number;
  Type: MsAdsAdExtensionType;
  Status?: "Active" | "Deleted";
  FinalUrls?: string[];
  TrackingUrlTemplate?: string;
  ScheduleEnd?: MsAdsSchedule;
  ScheduleStart?: MsAdsSchedule;
}

export interface MsAdsAudience {
  Id: number;
  Name: string;
  Type:
    | "CustomList"
    | "RemarketingList"
    | "ProductAudience"
    | "SimilarRemarketingList"
    | "InMarketAudience"
    | "CompanyName"
    | "JobFunction"
    | "Industry"
    | "EducationLevel"
    | "CombinedList"
    | "CustomerList";
  Status: "Active" | "Inactive" | "Paused" | "Deleted";
  Description?: string;
  MembershipDuration?: number;
}

export interface MsAdsLabel {
  Id: number;
  ColorCode?: string;
  Description?: string;
  Name: string;
}

// ─── API Response wrappers ────────────────────────────────────────────────────

/**
 * MS Ads uses verb-based responses like:
 * { GetCampaignsByAccountIdResponse: { Campaigns: Campaign[] } }
 */
export interface MsAdsServiceResponse<T> {
  [key: string]: T | string | undefined;
}

export interface MsAdsItemsWrapper<T> {
  [key: string]: T[] | undefined;
}

export interface MsAdsGetCampaignsResponse {
  GetCampaignsByAccountIdResponse?: MsAdsItemsWrapper<MsAdsCampaign>;
}

export interface MsAdsGetAdGroupsResponse {
  GetAdGroupsByCampaignIdResponse?: MsAdsItemsWrapper<MsAdsAdGroup>;
}

export type MsAdsMutateResponse = Record<string, unknown>;

// ─── Request body types ───────────────────────────────────────────────────────

export interface MsAdsCampaignAddRequest {
  Name: string;
  BudgetType: MsAdsBudgetMode;
  DailyBudget?: number;
  CampaignType?: MsAdsCampaignType;
  TimeZone: string;
  Languages?: string[];
}

export interface MsAdsAdGroupAddRequest {
  Name: string;
  CampaignId: number;
  Language?: string;
  Network?: string;
  BiddingScheme?: MsAdsBiddingScheme;
}

export interface MsAdsKeywordAddRequest {
  Text: string;
  MatchType: MsAdsMatchType;
  AdGroupId: number;
  Bid?: MsAdsBid;
  FinalUrls?: string[];
}

// ─── Error types ──────────────────────────────────────────────────────────────

export interface MsAdsBatchError {
  Code: number;
  ErrorCode: string;
  Message: string;
  Index: number;
}

export interface MsAdsApiError {
  Code?: number;
  ErrorCode?: string;
  Message: string;
  Details?: string[];
  BatchErrors?: MsAdsBatchError[];
}

export function isMsAdsApiError(value: unknown): value is MsAdsApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "Message" in value &&
    typeof (value as Record<string, unknown>)["Message"] === "string"
  );
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isMsAdsCampaign(value: unknown): value is MsAdsCampaign {
  return (
    typeof value === "object" &&
    value !== null &&
    "Id" in value &&
    typeof (value as Record<string, unknown>)["Id"] === "number" &&
    "Name" in value &&
    typeof (value as Record<string, unknown>)["Name"] === "string"
  );
}

export function isMsAdsAdGroup(value: unknown): value is MsAdsAdGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    "Id" in value &&
    typeof (value as Record<string, unknown>)["Id"] === "number" &&
    "Name" in value &&
    typeof (value as Record<string, unknown>)["Name"] === "string"
  );
}

export function isMsAdsAd(value: unknown): value is MsAdsAd {
  return (
    typeof value === "object" &&
    value !== null &&
    "Type" in value &&
    typeof (value as Record<string, unknown>)["Type"] === "string" &&
    "Status" in value &&
    typeof (value as Record<string, unknown>)["Status"] === "string"
  );
}

export function isMsAdsKeyword(value: unknown): value is MsAdsKeyword {
  return (
    typeof value === "object" &&
    value !== null &&
    "Text" in value &&
    typeof (value as Record<string, unknown>)["Text"] === "string" &&
    "MatchType" in value &&
    typeof (value as Record<string, unknown>)["MatchType"] === "string"
  );
}

export function isMsAdsBudget(value: unknown): value is MsAdsBudget {
  return (
    typeof value === "object" &&
    value !== null &&
    "Id" in value &&
    typeof (value as Record<string, unknown>)["Id"] === "number" &&
    "Amount" in value &&
    typeof (value as Record<string, unknown>)["Amount"] === "number"
  );
}
