// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

export type AmazonDspCanonicalEntityType =
  | "order"
  | "lineItem"
  | "creative"
  | "target"
  | "creativeAssociation";

export interface AmazonDspContractFieldRule {
  field: string;
  expectedType: "string" | "number" | "object";
  hint?: string;
}

export interface AmazonDspEntityContract {
  canonicalType: AmazonDspCanonicalEntityType;
  listPath: string;
  getPath: string;
  createPath: string;
  updatePath: string;
  /**
   * Vendor media type required on POST {createPath}. Amazon's API gateway routes
   * Bearer-authenticated writes via Content-Type negotiation; sending plain
   * `application/json` falls through to the SigV4 auth path and returns
   * 403 "Invalid key=value pair (missing equal-sign) in Authorization header".
   * Undefined for endpoints whose canonical path is not directly writable
   * (e.g. /dsp/creatives — writes go to subtype-specific paths).
   */
  createMediaType?: string;
  /** Vendor media type required on PUT {updatePath}. See createMediaType. */
  updateMediaType?: string;
  idField: string;
  responseKey: string;
  listFilterParam: string;
  displayName: string;
  requiredOnCreate: AmazonDspContractFieldRule[];
  readOnlyFields: string[];
  notes: string[];
}

export const AMAZON_DSP_ENTITY_CONTRACT: Record<
  AmazonDspCanonicalEntityType,
  AmazonDspEntityContract
> = {
  order: {
    canonicalType: "order",
    listPath: "/dsp/orders",
    getPath: "/dsp/orders/{entityId}",
    createPath: "/dsp/orders",
    updatePath: "/dsp/orders/{entityId}",
    createMediaType: "application/vnd.dsporders.v2.2+json",
    updateMediaType: "application/vnd.dsporders.v2.2+json",
    idField: "orderId",
    responseKey: "orders",
    listFilterParam: "advertiserId",
    displayName: "Campaign / Order",
    requiredOnCreate: [
      { field: "name", expectedType: "string" },
      { field: "advertiserId", expectedType: "string" },
      { field: "startDateTime", expectedType: "string", hint: "ISO 8601 date-time string" },
      { field: "endDateTime", expectedType: "string", hint: "ISO 8601 date-time string" },
    ],
    readOnlyFields: ["orderId", "creationDate", "lastUpdatedDate", "createdTime", "modifiedTime"],
    notes: [
      "Campaign management is backed by the order object in Amazon DSP.",
      "Amazon released Performance+ support via the optional automatedAdGroupCreation field on the order object.",
      "Budget and pacing fields vary by campaign type; keep payloads aligned with the specific campaign subtype in the Amazon reference.",
    ],
  },
  lineItem: {
    canonicalType: "lineItem",
    listPath: "/dsp/lineItems",
    getPath: "/dsp/lineItems/{entityId}",
    createPath: "/dsp/lineItems",
    updatePath: "/dsp/lineItems/{entityId}",
    createMediaType: "application/vnd.dsplineitems.v3.1+json",
    updateMediaType: "application/vnd.dsplineitems.v3.1+json",
    idField: "lineItemId",
    responseKey: "lineItems",
    listFilterParam: "orderId",
    displayName: "Ad Group / Line Item",
    requiredOnCreate: [
      { field: "name", expectedType: "string" },
      { field: "orderId", expectedType: "string", hint: "Parent campaign / order ID" },
      { field: "advertiserId", expectedType: "string" },
      {
        field: "budget",
        expectedType: "object",
        hint: '{ budgetType: "DAILY" | "LIFETIME", budget: number }',
      },
    ],
    readOnlyFields: [
      "lineItemId",
      "creationDate",
      "lastUpdatedDate",
      "createdTime",
      "modifiedTime",
    ],
    notes: [
      "Ad group management is backed by the line item object in Amazon DSP.",
      "Targeting and optimization options vary by media type and tactic.",
    ],
  },
  creative: {
    canonicalType: "creative",
    listPath: "/dsp/creatives",
    getPath: "/dsp/creatives/{entityId}",
    createPath: "/dsp/creatives",
    updatePath: "/dsp/creatives/{entityId}",
    idField: "creativeId",
    responseKey: "creatives",
    listFilterParam: "advertiserId",
    displayName: "Creative",
    requiredOnCreate: [
      { field: "name", expectedType: "string" },
      { field: "advertiserId", expectedType: "string" },
      {
        field: "creativeType",
        expectedType: "string",
        hint: "Creative subtype accepted by Amazon DSP",
      },
    ],
    readOnlyFields: [
      "creativeId",
      "creationDate",
      "lastUpdatedDate",
      "createdTime",
      "modifiedTime",
    ],
    notes: [
      "Creative creation depends on the underlying format and may require additional assets or subtype-specific fields.",
      "Creative association to line items is modeled separately from creative asset creation.",
      "Amazon DSP has no plain POST /dsp/creatives endpoint — writes are subtype-routed (/dsp/creatives/image, /video, /thirdParty, /rec) with their own vendor media types. The createPath/updatePath above are for read-side aggregation only; create/update via this service will not work until subtype routing is added.",
    ],
  },
  target: {
    canonicalType: "target",
    listPath: "/dsp/targets",
    getPath: "/dsp/targets/{entityId}",
    createPath: "/dsp/targets",
    updatePath: "/dsp/targets/{entityId}",
    idField: "targetId",
    responseKey: "targets",
    listFilterParam: "lineItemId",
    displayName: "Target",
    requiredOnCreate: [
      { field: "lineItemId", expectedType: "string", hint: "Parent ad group / line item ID" },
    ],
    readOnlyFields: ["targetId", "creationDate", "lastUpdatedDate", "createdTime", "modifiedTime"],
    notes: [
      "The exact request shape depends on the targeting tactic and media type.",
      "Use Amazon’s current targeting docs to choose the correct expression structure and targeting subtype fields.",
    ],
  },
  creativeAssociation: {
    canonicalType: "creativeAssociation",
    listPath: "/dsp/creativeAssociations",
    getPath: "/dsp/creativeAssociations/{entityId}",
    createPath: "/dsp/creativeAssociations",
    updatePath: "/dsp/creativeAssociations/{entityId}",
    idField: "creativeAssociationId",
    responseKey: "creativeAssociations",
    listFilterParam: "lineItemId",
    displayName: "Creative Association",
    requiredOnCreate: [
      { field: "lineItemId", expectedType: "string", hint: "Parent ad group / line item ID" },
      { field: "creativeId", expectedType: "string", hint: "Creative asset to associate" },
    ],
    readOnlyFields: [
      "creativeAssociationId",
      "creationDate",
      "lastUpdatedDate",
      "createdTime",
      "modifiedTime",
    ],
    notes: [
      "Creative associations link existing creative assets to delivery entities.",
      "Amazon’s public launch notes mention creative association batch-read support; callers should prefer Amazon’s latest contract for high-volume association workflows.",
    ],
  },
};

export const AMAZON_DSP_CANONICAL_ENTITY_TYPES = Object.keys(
  AMAZON_DSP_ENTITY_CONTRACT
) as AmazonDspCanonicalEntityType[];

/**
 * Amazon DSP Reporting API contract (the legacy `/dsp/reports` surface).
 *
 * NOT to be confused with the Sponsored Ads v3 Reporting API at
 * `/reporting/reports` — that endpoint uses a `configuration{adProduct,
 * reportTypeId, groupBy, columns, format}` envelope and does NOT accept DSP
 * report types. The DSP equivalent at `/dsp/reports` has a completely
 * different request shape (flat body, `type`+`dimensions`+`metrics`,
 * `YYYYMMDD` dates, plain `application/json`).
 *
 * Discovered empirically on 2026-05-15 — see
 * `docs/plans/2026-05-15-amazon-dsp-live-test-findings.md` for the full probe
 * trail. The previous contract here targeted the Sponsored Ads v3 endpoint
 * and never worked against a live DSP account.
 */
export const AMAZON_DSP_REPORTING_CONTRACT = {
  submitPathTemplate: "/dsp/reports",
  statusPathTemplate: "/dsp/reports/{reportId}",
  /** Status values the live API actually returns (legacy DSP shape). */
  statuses: ["IN_PROGRESS", "SUCCESS", "FAILURE"] as const,
  defaultTimeUnit: "DAILY" as const,
  /** Allowed `type` values for /dsp/reports (discovered via 422 error message). */
  reportTypes: [
    "CAMPAIGN",
    "INVENTORY",
    "AUDIENCE",
    "PRODUCTS",
    "TECHNOLOGY",
    "GEOGRAPHY",
    "CONVERSION_SOURCE",
  ] as const,
  /** Allowed `dimensions` values per report type (incomplete — extend as discovered). */
  dimensionsByType: {
    CAMPAIGN: ["ORDER", "LINE_ITEM", "CREATIVE"] as const,
  },
  /**
   * Confirmed-valid metric names (4 sampled live for CAMPAIGN type — the API
   * surfaces an authoritative invalid-list in 422 errors, so use that for
   * runtime validation rather than hardcoding the full catalog here).
   */
  knownMetrics: ["impressions", "totalCost", "viewableImpressions", "viewabilityRate"],
  notes: [
    "POST /dsp/reports body shape: { startDate (YYYYMMDD), endDate (YYYYMMDD), type (one of reportTypes), dimensions?: string[], metrics?: string (comma-separated), timeUnit?: 'DAILY' }.",
    "Returns 202 with { reportId, type, format, status:'IN_PROGRESS', location:'', expiration } — poll GET /dsp/reports/{reportId} until status === 'SUCCESS' (returns presigned S3 download `location`) or 'FAILURE'.",
    "Plain application/json Content-Type works — no vendor media type required (unlike entity writes).",
    "Endpoint is NOT account-scoped — `accountId` is not part of the URL path. The Amazon-Advertising-API-Scope header still identifies the profile.",
  ],
} as const;

export function normalizeAmazonDspEntityType(
  entityType: AmazonDspCanonicalEntityType | string
): AmazonDspCanonicalEntityType {
  if (entityType in AMAZON_DSP_ENTITY_CONTRACT) {
    return entityType as AmazonDspCanonicalEntityType;
  }

  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Unknown Amazon DSP entity type: ${entityType}`
  );
}

export function getAmazonDspEntityContract(
  entityType: AmazonDspCanonicalEntityType | string
): AmazonDspEntityContract {
  return AMAZON_DSP_ENTITY_CONTRACT[normalizeAmazonDspEntityType(entityType)];
}
