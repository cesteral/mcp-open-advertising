// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn Marketing API v2 entity type definitions
 * Hand-crafted from LinkedIn Marketing API v2 reference
 * LinkedIn uses URN-based IDs: urn:li:sponsoredCampaign:{id}, urn:li:sponsoredAccount:{id}
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export type LinkedInCampaignStatus =
  | "ACTIVE"
  | "PAUSED"
  | "ARCHIVED"
  | "COMPLETED"
  | "CANCELED"
  | "DRAFT"
  | "PENDING_DELETION"
  | "REMOVED";

export type LinkedInCampaignType =
  | "TEXT_AD"
  | "SPONSORED_UPDATES"
  | "SPONSORED_INMAILS"
  | "DYNAMIC"
  | "SPONSORED_UPDATES_CAROUSEL"
  | "VIDEO"
  | "CONVERSATION"
  | "THOUGHT_LEADER_ADS"
  | "NORMALIZED_DISPLAY_AD";

export type LinkedInCampaignObjectiveType =
  | "AWARENESS"
  | "BRAND_AWARENESS"
  | "ENGAGEMENT"
  | "JOB_APPLICANTS"
  | "LEAD_GENERATION"
  | "VIDEO_VIEWS"
  | "WEBSITE_CONVERSIONS"
  | "WEBSITE_VISITS"
  | "TALENT_LEADS";

export type LinkedInOptimizationTargetType =
  | "ENHANCED_CONVERSION"
  | "NONE"
  | "MAX_CLICK"
  | "MAX_IMPRESSION"
  | "MAX_CONVERSION"
  | "MAX_VIDEO_VIEW"
  | "TARGET_COST_PER_CLICK"
  | "TARGET_COST_PER_IMPRESSION"
  | "TARGET_COST_PER_VIDEO_VIEW";

export type LinkedInCreativeStatus =
  | "ACTIVE"
  | "PAUSED"
  | "ARCHIVED"
  | "COMPLETED"
  | "CANCELED"
  | "DRAFT"
  | "PENDING_DELETION"
  | "REMOVED";

// ─── URN Helper Type ─────────────────────────────────────────────────────────

/** LinkedIn URN format: urn:li:{type}:{id} */
export type LinkedInUrn = string;

// ─── Audit Stamp ─────────────────────────────────────────────────────────────

export interface LinkedInAuditStamp {
  actor: LinkedInUrn;
  time: number;
}

// ─── Core Entity Interfaces ──────────────────────────────────────────────────

export interface LinkedInAdAccount {
  id: number;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "CLOSED";
  currency: string;
  type: "BUSINESS" | "ENTERPRISE";
  test: boolean;
  created?: LinkedInAuditStamp;
  lastModified?: LinkedInAuditStamp;
}

export interface LinkedInCampaignGroup {
  id: number;
  /** Nested in reference.name in the LinkedIn API */
  name: string;
  status: LinkedInCampaignStatus;
  account: LinkedInUrn;
  created?: LinkedInAuditStamp;
  lastModified?: LinkedInAuditStamp;
}

export interface LinkedInAmount {
  amount: string;
  currencyCode: string;
}

export interface LinkedInSchedule {
  start: number;
  end?: number;
}

export interface LinkedInLocale {
  country: string;
  language: string;
}

export interface LinkedInTargetingFacets {
  locations?: LinkedInUrn[];
  seniorities?: LinkedInUrn[];
  jobFunctions?: LinkedInUrn[];
  titles?: LinkedInUrn[];
  skills?: LinkedInUrn[];
  companies?: LinkedInUrn[];
  industries?: LinkedInUrn[];
}

export interface LinkedInTargeting {
  includedTargetingFacets?: LinkedInTargetingFacets;
  excludedTargetingFacets?: LinkedInTargetingFacets;
}

export interface LinkedInCampaign {
  id: number;
  name: string;
  status: LinkedInCampaignStatus;
  type: LinkedInCampaignType;
  campaignGroup: LinkedInUrn;
  account: LinkedInUrn;
  objectiveType?: LinkedInCampaignObjectiveType;
  optimizationTargetType?: LinkedInOptimizationTargetType;
  unitCost?: LinkedInAmount;
  dailyBudget?: LinkedInAmount;
  totalBudget?: LinkedInAmount;
  runSchedule?: LinkedInSchedule;
  targeting?: LinkedInTargeting;
  locale?: LinkedInLocale;
  format?: string;
  created?: LinkedInAuditStamp;
  lastModified?: LinkedInAuditStamp;
}

export interface LinkedInCreativeVariables {
  data: Record<string, unknown>;
}

export interface LinkedInCreative {
  id: number;
  status: LinkedInCreativeStatus;
  campaign: LinkedInUrn;
  reference?: LinkedInUrn;
  type?: string;
  variables?: LinkedInCreativeVariables;
  created?: LinkedInAuditStamp;
  lastModified?: LinkedInAuditStamp;
}

export interface LinkedInConversionRule {
  id: number;
  name: string;
  account: LinkedInUrn;
  type: string;
  enabled: boolean;
  postClickAttributionWindowSize?: number;
  viewThroughAttributionWindowSize?: number;
  created?: LinkedInAuditStamp;
  lastModified?: LinkedInAuditStamp;
}

// ─── Analytics Types ─────────────────────────────────────────────────────────

export interface LinkedInDate {
  day: number;
  month: number;
  year: number;
}

export interface LinkedInDateRange {
  start: LinkedInDate;
  end: LinkedInDate;
}

export interface LinkedInAnalyticsElement {
  dateRange?: LinkedInDateRange;
  impressions?: number;
  clicks?: number;
  totalEngagements?: number;
  videoViews?: number;
  opens?: number;
  reactions?: number;
  follows?: number;
  companyPageClicks?: number;
  pivot?: string;
  pivotValue?: LinkedInUrn;
  pivotValues?: LinkedInUrn[];
  costInLocalCurrency?: string;
  approximateUniqueImpressions?: number;
}

export interface LinkedInAnalyticsResponse {
  elements: LinkedInAnalyticsElement[];
  paging?: LinkedInPaging;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface LinkedInPaging {
  start: number;
  count: number;
  total?: number;
}

export interface LinkedInElementsResponse<T> {
  elements: T[];
  paging?: LinkedInPaging;
}

// ─── Request Body Types ───────────────────────────────────────────────────────

export interface CreateLinkedInCampaignGroupRequest {
  account: LinkedInUrn;
  name: string;
  status?: LinkedInCampaignStatus;
}

export interface CreateLinkedInCampaignRequest {
  name: string;
  account: LinkedInUrn;
  campaignGroup: LinkedInUrn;
  type: LinkedInCampaignType;
  objectiveType?: LinkedInCampaignObjectiveType;
  status?: LinkedInCampaignStatus;
  dailyBudget?: LinkedInAmount;
  totalBudget?: LinkedInAmount;
  unitCost?: LinkedInAmount;
  targeting?: LinkedInTargeting;
  runSchedule?: LinkedInSchedule;
  locale?: LinkedInLocale;
}

export interface CreateLinkedInCreativeRequest {
  campaign: LinkedInUrn;
  reference?: LinkedInUrn;
  status?: LinkedInCreativeStatus;
  type?: string;
  variables?: LinkedInCreativeVariables;
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isLinkedInCampaign(value: unknown): value is LinkedInCampaign {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LinkedInCampaign).id === "number" &&
    typeof (value as LinkedInCampaign).campaignGroup === "string"
  );
}

export function isLinkedInCampaignGroup(value: unknown): value is LinkedInCampaignGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LinkedInCampaignGroup).id === "number" &&
    typeof (value as LinkedInCampaignGroup).account === "string"
  );
}

export function isLinkedInCreative(value: unknown): value is LinkedInCreative {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LinkedInCreative).id === "number" &&
    typeof (value as LinkedInCreative).campaign === "string"
  );
}

export function isLinkedInAdAccount(value: unknown): value is LinkedInAdAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LinkedInAdAccount).id === "number" &&
    typeof (value as LinkedInAdAccount).currency === "string"
  );
}

export function isLinkedInConversionRule(value: unknown): value is LinkedInConversionRule {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LinkedInConversionRule).id === "number" &&
    typeof (value as LinkedInConversionRule).account === "string"
  );
}
