// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

// ─── Enums ──────────────────────────────────────────────────────────────────

export type AmazonDspOrderStatus = "ENABLED" | "PAUSED" | "ARCHIVED";
export type AmazonDspLineItemStatus = "ENABLED" | "PAUSED" | "ARCHIVED";
export type AmazonDspCreativeStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type AmazonDspBudgetType = "DAILY" | "LIFETIME";
export type AmazonDspLineItemType =
  | "standardDisplay"
  | "video"
  | "mobile"
  | "interstitial";
export type AmazonDspCreativeType = "STANDARD_DISPLAY" | "VIDEO" | "RICH_MEDIA";
export type AmazonDspBidOptimization =
  | "AUTO"
  | "MANUAL"
  | "NONE"
  | "CONVERSIONS"
  | "VCPM_VIEWABLE"
  | "REACH";

// ─── Sub-objects ─────────────────────────────────────────────────────────────

/** Line item budget is a nested object (distinct from flat order budget). */
export interface AmazonDspLineItemBudget {
  budgetType: AmazonDspBudgetType;
  budget: number;
}

export interface AmazonDspBidding {
  baseBid?: number;
  maxBid?: number;
  bidOptimization?: AmazonDspBidOptimization;
  bidAmount?: number;
}

export interface AmazonDspTargetingClause {
  type: string;
  value?: string;
  values?: string[];
}

// ─── Core Entity Interfaces ──────────────────────────────────────────────────

export interface AmazonDspOrder {
  orderId: string;
  name: string;
  state: AmazonDspOrderStatus;
  advertiserId: string;
  startDateTime?: string;
  endDateTime?: string;
  budget?: number;
  budgetType?: AmazonDspBudgetType;
  currencyCode?: string;
  impressionsGoal?: number;
  creationDate?: string;
  lastUpdatedDate?: string;
}

export interface AmazonDspLineItem {
  lineItemId: string;
  name: string;
  state: AmazonDspLineItemStatus;
  orderId: string;
  advertiserId: string;
  lineItemType?: AmazonDspLineItemType;
  startDateTime?: string;
  endDateTime?: string;
  /** Nested budget object — use { budgetType, budget } (not flat fields). */
  budget?: AmazonDspLineItemBudget;
  bidding?: AmazonDspBidding;
  targetingClauses?: AmazonDspTargetingClause[];
  creationDate?: string;
  lastUpdatedDate?: string;
}

export interface AmazonDspCreative {
  creativeId: string;
  name: string;
  state: AmazonDspCreativeStatus;
  advertiserId: string;
  creativeType: AmazonDspCreativeType;
  clickThroughUrl?: string;
  width?: number;
  height?: number;
  creationDate?: string;
  lastUpdatedDate?: string;
}

export interface AmazonDspTarget {
  targetId: string;
  lineItemId: string;
  advertiserId?: string;
  state?: string;
  expressionType?: string;
  expression?: unknown;
  creationDate?: string;
  lastUpdatedDate?: string;
}

export interface AmazonDspCreativeAssociation {
  creativeAssociationId: string;
  creativeId: string;
  lineItemId: string;
  advertiserId?: string;
  state?: string;
  creationDate?: string;
  lastUpdatedDate?: string;
}

export interface AmazonDspAdvertiser {
  advertiserId: string;
  name: string;
  countryCode?: string;
  currencyCode?: string;
  timeZone?: string;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface AmazonDspPageInfo {
  startIndex: number;
  count: number;
  totalResults: number;
}

export interface AmazonDspListResponse<T> {
  response: T[];
  totalResults?: number;
  startIndex?: number;
  count?: number;
}

// ─── Request Types ───────────────────────────────────────────────────────────

export interface CreateAmazonDspOrderRequest {
  name: string;
  advertiserId: string;
  startDateTime?: string;
  endDateTime?: string;
  budget?: number;
  budgetType?: AmazonDspBudgetType;
  currencyCode?: string;
  impressionsGoal?: number;
}

export interface CreateAmazonDspLineItemRequest {
  name: string;
  orderId: string;
  advertiserId: string;
  lineItemType?: AmazonDspLineItemType;
  startDateTime?: string;
  endDateTime?: string;
  /** Nested budget object — use { budgetType, budget } (not flat fields). */
  budget?: AmazonDspLineItemBudget;
  bidding?: AmazonDspBidding;
}

export interface CreateAmazonDspTargetRequest {
  lineItemId: string;
  advertiserId?: string;
  [key: string]: unknown;
}

export interface CreateAmazonDspCreativeAssociationRequest {
  creativeId: string;
  lineItemId: string;
  advertiserId?: string;
  [key: string]: unknown;
}

// ─── Error Type ──────────────────────────────────────────────────────────────

export interface AmazonDspApiError {
  code?: string;
  message: string;
  details?: string;
  status?: number;
}

// ─── Type Guards ─────────────────────────────────────────────────────────────

export function isAmazonDspOrder(value: unknown): value is AmazonDspOrder {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AmazonDspOrder).orderId === "string" &&
    typeof (value as AmazonDspOrder).advertiserId === "string"
  );
}

export function isAmazonDspLineItem(
  value: unknown
): value is AmazonDspLineItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AmazonDspLineItem).lineItemId === "string" &&
    typeof (value as AmazonDspLineItem).orderId === "string"
  );
}

export function isAmazonDspCreative(
  value: unknown
): value is AmazonDspCreative {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AmazonDspCreative).creativeId === "string" &&
    typeof (value as AmazonDspCreative).advertiserId === "string"
  );
}

export function isAmazonDspApiError(
  value: unknown
): value is AmazonDspApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AmazonDspApiError).message === "string"
  );
}
