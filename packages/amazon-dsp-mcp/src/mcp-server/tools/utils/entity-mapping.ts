// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Mapping
 *
 * Amazon DSP entity terminology differs from TikTok:
 * - "Orders" = Campaigns
 * - "Line Items" = Ad Groups
 * - "Creatives" = Creatives/Ads
 *
 * Key Amazon DSP patterns:
 * - No DELETE endpoint — archive via PUT with { state: "ARCHIVED" }
 * - Offset pagination: startIndex + count query params
 * - Response includes totalResults
 * - Required headers: Amazon-Advertising-API-ClientId + Amazon-Advertising-API-Scope
 */

export type AmazonDspEntityType = "order" | "lineItem" | "creative";

export interface AmazonDspEntityConfig {
  /** API path for list (GET with query params) */
  listPath: string;
  /** API path for get single entity */
  getPath: string;
  /** API path for create (POST) */
  createPath: string;
  /** API path for update (PUT) */
  updatePath: string;
  /** Primary ID field name in the response */
  idField: string;
  /** Response array key (e.g., "orders") */
  responseKey: string;
  /** Query param name for parent filter on list (e.g., "advertiserId", "orderId") */
  listFilterParam: string;
  /** Display name */
  displayName: string;
  /** Default fields to return */
  defaultFields: string[];
}

const ENTITY_CONFIGS: Record<AmazonDspEntityType, AmazonDspEntityConfig> = {
  order: {
    listPath: "/dsp/orders",
    getPath: "/dsp/orders/{entityId}",
    createPath: "/dsp/orders",
    updatePath: "/dsp/orders/{entityId}",
    idField: "orderId",
    responseKey: "orders",
    listFilterParam: "advertiserId",
    displayName: "Order (Campaign)",
    defaultFields: ["orderId", "name", "advertiserId", "budget", "startDate", "endDate", "state"],
  },
  lineItem: {
    listPath: "/dsp/lineItems",
    getPath: "/dsp/lineItems/{entityId}",
    createPath: "/dsp/lineItems",
    updatePath: "/dsp/lineItems/{entityId}",
    idField: "lineItemId",
    responseKey: "lineItems",
    listFilterParam: "orderId",
    displayName: "Line Item (Ad Group)",
    defaultFields: ["lineItemId", "name", "orderId", "budget", "bidding", "state", "targetingCriteria"],
  },
  creative: {
    listPath: "/dsp/creatives",
    getPath: "/dsp/creatives/{entityId}",
    createPath: "/dsp/creatives",
    updatePath: "/dsp/creatives/{entityId}",
    idField: "creativeId",
    responseKey: "creatives",
    listFilterParam: "advertiserId",
    displayName: "Creative",
    defaultFields: ["creativeId", "name", "advertiserId", "creativeType", "clickThroughUrl"],
  },
};

export function getEntityConfig(entityType: AmazonDspEntityType): AmazonDspEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown Amazon DSP entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): AmazonDspEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as AmazonDspEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  return getSupportedEntityTypes() as [string, ...string[]];
}

/**
 * Interpolate path template placeholders.
 */
export function interpolatePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, val),
    path
  );
}