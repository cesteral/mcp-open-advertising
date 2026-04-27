// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export type AmazonDspCanonicalEntityType =
  | "order"
  | "lineItem"
  | "creative"
  | "target"
  | "creativeAssociation";

export type AmazonDspPublicEntityType = AmazonDspCanonicalEntityType | "campaign" | "adGroup";

export interface AmazonDspContractFieldRule {
  field: string;
  expectedType: "string" | "number" | "object";
  hint?: string;
}

export interface AmazonDspEntityContract {
  canonicalType: AmazonDspCanonicalEntityType;
  aliases: string[];
  listPath: string;
  getPath: string;
  createPath: string;
  updatePath: string;
  idField: string;
  responseKey: string;
  listFilterParam: string;
  displayName: string;
  requiredOnCreate: AmazonDspContractFieldRule[];
  readOnlyFields: string[];
  notes: string[];
}

export const AMAZON_DSP_ENTITY_ALIASES: Record<string, AmazonDspCanonicalEntityType> = {
  campaign: "order",
  adGroup: "lineItem",
};

export const AMAZON_DSP_ENTITY_CONTRACT: Record<
  AmazonDspCanonicalEntityType,
  AmazonDspEntityContract
> = {
  order: {
    canonicalType: "order",
    aliases: ["campaign"],
    listPath: "/dsp/orders",
    getPath: "/dsp/orders/{entityId}",
    createPath: "/dsp/orders",
    updatePath: "/dsp/orders/{entityId}",
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
    aliases: ["adGroup"],
    listPath: "/dsp/lineItems",
    getPath: "/dsp/lineItems/{entityId}",
    createPath: "/dsp/lineItems",
    updatePath: "/dsp/lineItems/{entityId}",
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
    aliases: [],
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
    ],
  },
  target: {
    canonicalType: "target",
    aliases: [],
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
    aliases: [],
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

export const AMAZON_DSP_PUBLIC_ENTITY_TYPES = [
  ...AMAZON_DSP_CANONICAL_ENTITY_TYPES,
  "campaign",
  "adGroup",
] as const satisfies readonly AmazonDspPublicEntityType[];

export const AMAZON_DSP_REPORTING_CONTRACT = {
  submitPathTemplate: "/accounts/{accountId}/dsp/reports",
  statusPathTemplate: "/accounts/{accountId}/dsp/reports/{reportId}",
  submitAcceptMediaType: "application/vnd.dspcreatereports.v3+json",
  statusAcceptMediaType: "application/vnd.dspgetreports.v3+json",
  statuses: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const,
  defaultAdProduct: "DEMAND_SIDE_PLATFORM",
  defaultTimeUnit: "DAILY" as const,
  defaultFormat: "GZIP_JSON" as const,
  commonReportTypeIds: ["dspLineItem", "dspOrder", "dspCreative", "dspAudience"],
  commonGroupBy: ["order", "lineItem", "creative", "audience", "date"],
  commonColumns: ["impressions", "clickThroughs", "totalCost", "dpv14d", "purchases14d"],
  notes: [
    "Amazon DSP reporting v3 is asynchronous and uses POST /accounts/{accountId}/dsp/reports followed by GET /accounts/{accountId}/dsp/reports/{reportId}.",
    "The accountId is the DSP account (entity) identifier and appears in the URL path; it is separate from the Amazon-Advertising-API-Scope profile header.",
    "POST requires Accept: application/vnd.dspcreatereports.v3+json; status GET requires Accept: application/vnd.dspgetreports.v3+json.",
    "Completed reports expose a presigned download URL for the compressed report output.",
  ],
} as const;

export function normalizeAmazonDspEntityType(
  entityType: AmazonDspPublicEntityType | string
): AmazonDspCanonicalEntityType {
  if (entityType in AMAZON_DSP_ENTITY_CONTRACT) {
    return entityType as AmazonDspCanonicalEntityType;
  }

  const aliased = AMAZON_DSP_ENTITY_ALIASES[entityType];
  if (aliased) {
    return aliased;
  }

  throw new Error(`Unknown Amazon DSP entity type: ${entityType}`);
}

export function getAmazonDspEntityContract(
  entityType: AmazonDspPublicEntityType | string
): AmazonDspEntityContract {
  return AMAZON_DSP_ENTITY_CONTRACT[normalizeAmazonDspEntityType(entityType)];
}
