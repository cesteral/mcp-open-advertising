// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

/**
 * Entity management contract — Amazon Ads **Unified API** (`/adsApi/v1/*`), #234.
 *
 * Every path, body key, filter name, batch limit and required field below comes
 * from Amazon's machine-readable Unified DSP spec and its DSP migration guide:
 *
 *   amzn/ads-advanced-tools-docs @ e25aace0ec07997c113dac48f333298472243558
 *     unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json
 *       (OpenAPI 3.0.1, "Amazon Ads API DSP Merged" 3.0)
 *     unified-campaign-management-migration-skills/skills/unified-dsp-cm-migration/SKILL.md
 *
 * The Unified surface replaces the `/dsp/orders`, `/dsp/lineItems`,
 * `/dsp/creatives`, `/dsp/targets` and `/dsp/creativeAssociations` endpoints
 * this server used to call — a generation older than the `/dsp/v1/*` API the
 * migration guide itself calls "legacy", and absent from Amazon's current
 * Postman collection. Nothing here has been exercised against Amazon: every
 * claim is `unverified` in `platform-facts.json` (`amazon_dsp.unified_entity_api`).
 *
 * What the spec establishes for every DSP entity operation:
 *   - `POST /adsApi/v1/{create|update|query|delete}/{resource}` — all POST.
 *   - Header parameters `Amazon-Ads-AccountId` (AccountIdHeader, required) and
 *     `Amazon-Ads-ClientId` (ClientIdHeader, required). No profile/scope
 *     header is declared, and the DSP migration guide §2 says
 *     `Amazon-Advertising-API-Scope` is "Not used" — the HTTP client therefore
 *     omits it on `/adsApi/v1/*`.
 *   - `adProduct: "AMAZON_DSP"` is required on every create and as
 *     `adProductFilter` on every query except `query/adAssociations`.
 *   - Writes answer 207 `{ success: [{ index, <item> }], error: [{ index, errors: [{ code, message, fieldLocation? }] }] }`;
 *     queries answer 200 `{ <resource>: [...], nextToken? }`.
 *
 * The entity-type names callers pass (`order`, `lineItem`, `creative`,
 * `target`, `creativeAssociation`) are kept from the pre-#234 surface; each
 * maps onto one Unified resource (`campaigns`, `adGroups`, `ads`, `targets`,
 * `adAssociations`).
 */
export const AMAZON_DSP_UNIFIED_SPEC_BASIS =
  "amzn/ads-advanced-tools-docs@e25aace0ec07997c113dac48f333298472243558 unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json";

export const AMAZON_DSP_AD_PRODUCT = "AMAZON_DSP" as const;

export type AmazonDspCanonicalEntityType =
  | "order"
  | "lineItem"
  | "creative"
  | "target"
  | "creativeAssociation";

export type AmazonDspUnifiedResource =
  | "campaigns"
  | "adGroups"
  | "ads"
  | "targets"
  | "adAssociations";

export type AmazonDspUnifiedAction = "create" | "update" | "query" | "delete";

/** `/adsApi/v1/{action}/{resource}` — the only path shape the DSP spec uses for entities. */
export function unifiedEntityPath(
  action: AmazonDspUnifiedAction,
  resource: AmazonDspUnifiedResource
): string {
  return `/adsApi/v1/${action}/${resource}`;
}

export interface AmazonDspContractFieldRule {
  field: string;
  expectedType: "string" | "number" | "object" | "array" | "boolean";
  hint?: string;
}

export interface AmazonDspUnifiedContract {
  resource: AmazonDspUnifiedResource;
  /** Key of the entity inside each multi-status `success[]` entry (e.g. `campaign`). */
  itemKey: string;
  /** Primary-key field on the Unified entity (e.g. `campaignId`). */
  idField: string;
  /**
   * Query filter that selects by primary key, or undefined when the query
   * request has none (`DSPQueryTargetRequest` has no targetId filter).
   */
  idFilter?: string;
  /** `adProductFilter` is required on the query request (absent on adAssociations). */
  adProductFilter: boolean;
  /** `maxResults` maximum on the query request. */
  maxResults: number;
  /** Batch limit on create/update (`minItems 1`, `maxItems N`). */
  writeBatchMax: number;
  /**
   * Caller-facing `filters` key → Unified query filter (`{ include: [...] }`).
   * Legacy keys (`orderId`, `lineItemId`, `creativeId`) are accepted as aliases.
   */
  filterKeys: Record<string, string>;
  /** Key of the id array on the delete request (`targetIds`, `adAssociationIds`). */
  deleteIdsKey?: string;
  /** Spec operationIds, for the `// basis:` trail. */
  operations: {
    query: string;
    create: string;
    update?: string;
    delete?: string;
  };
}

export interface AmazonDspEntityContract {
  canonicalType: AmazonDspCanonicalEntityType;
  displayName: string;
  unified: AmazonDspUnifiedContract;
  /** Primary ID field name in responses (mirrors `unified.idField`). */
  idField: string;
  /**
   * Legacy (`/dsp/*`) field names accepted in create payloads and mapped to
   * their Unified names. Only 1:1 renames the spec supports are listed.
   */
  legacyFieldRenames: Record<string, string>;
  /**
   * `state` a create must carry. The spec's `DSPCreateState` description: "For
   * ADSP, campaign and ad group resources can only be created in the PAUSED
   * state and must be updated to ENABLED to activate for delivery."
   */
  createStateMustBe?: "PAUSED";
  /** Set when this server cannot read one entity by ID. */
  getUnsupportedReason?: string;
  /** Set when this server cannot create this entity type. */
  createUnsupportedReason?: string;
  /** Set when this server cannot update this entity type. */
  updateUnsupportedReason?: string;
  /** Set when this server cannot remove this entity type. */
  deleteUnsupportedReason?: string;
  /**
   * LEGACY fallback for removal — the ONLY pre-#234 call still made. The
   * Unified DSP spec has no delete for campaigns / ad groups, and its
   * `DSPUpdateState` enum is `ENABLED | PAUSED` (no `ARCHIVED`), so archiving
   * an order or line item has no Unified equivalent. `amazon_dsp_delete_entity`
   * keeps the old `PUT {path} { state: "ARCHIVED" }` for those two types.
   * Never verified live; whether a Unified `campaignId` / `adGroupId` is
   * accepted as the legacy `orderId` / `lineItemId` is unverified.
   */
  legacyArchive?: { pathTemplate: string; mediaType: string };
  /** Fields a caller must supply on create (server-supplied `adProduct` / `state` excluded where defaulted). */
  requiredOnCreate: AmazonDspContractFieldRule[];
  /** Top-level fields present on the Unified read shape but not on its create shape. */
  readOnlyFields: string[];
  /**
   * Nested read-only paths (dotted; arrays traversed) — present on the read
   * schema, absent from the create schema. Derived by diffing the spec's
   * `DSP<Entity>` against `DSP<Entity>Create`. Stripped before a duplicate.
   */
  readOnlyNestedPaths: string[];
  /** Top-level keys the create schema accepts (a duplicate is projected onto these). */
  createFields: string[];
  notes: string[];
}

const COMMON_NOTES = [
  "Unified API: every call is a POST and carries `Amazon-Ads-AccountId: <accountId>` (the tool's `accountId` argument).",
];

export const AMAZON_DSP_ENTITY_CONTRACT: Record<
  AmazonDspCanonicalEntityType,
  AmazonDspEntityContract
> = {
  order: {
    canonicalType: "order",
    displayName: "Campaign / Order",
    idField: "campaignId",
    unified: {
      resource: "campaigns",
      itemKey: "campaign",
      idField: "campaignId",
      idFilter: "campaignIdFilter",
      adProductFilter: true,
      maxResults: 100,
      writeBatchMax: 5,
      filterKeys: {
        campaignId: "campaignIdFilter",
        orderId: "campaignIdFilter",
        state: "stateFilter",
      },
      operations: {
        query: "DSPQueryCampaign",
        create: "DSPCreateCampaign",
        update: "DSPUpdateCampaign",
      },
    },
    legacyFieldRenames: {},
    createStateMustBe: "PAUSED",
    legacyArchive: {
      pathTemplate: "/dsp/orders/{entityId}",
      mediaType: "application/vnd.dsporders.v2.2+json",
    },
    requiredOnCreate: [
      { field: "name", expectedType: "string" },
      {
        field: "flights",
        expectedType: "array",
        hint: "1–150 flights: { startDateTime, endDateTime, budget: { budgetType: 'MONETARY', budgetValue: { monetaryBudgetValue: { monetaryBudget: { value } } } } }",
      },
      {
        field: "optimizations",
        expectedType: "object",
        hint: "{ bidSettings: { bidStrategy }, goalSettings: { kpi } }",
      },
    ],
    readOnlyFields: [
      "campaignId",
      "creationDateTime",
      "lastUpdatedDateTime",
      "status",
      "startDateTime",
      "endDateTime",
      "eligibleAutomatedTargetingTactics",
      "ineligibleAutomatedTargetingTactics",
      "targetsAmazonDeal",
    ],
    readOnlyNestedPaths: [
      "budgets.budgetValue.monetaryBudgetValue.monetaryBudget.currencyCode",
      "flights.budget.budgetValue.monetaryBudgetValue.monetaryBudget.currencyCode",
      "optimizations.goalSettings.currencyCode",
      "optimizations.goalSettings.goal",
    ],
    createFields: [
      "adProduct",
      "adomains",
      "autoCreationSettings",
      "budgets",
      "countries",
      "fees",
      "flights",
      "frequencies",
      "marketplaces",
      "name",
      "optimizations",
      "purchaseOrderNumber",
      "skanAppId",
      "state",
      "tags",
    ],
    notes: [
      "An `order` is a Unified DSP campaign (`/adsApi/v1/*/campaigns`); its ID field is `campaignId`.",
      "The advertiser is not a body field: Unified derives it from the `Amazon-Ads-AccountId` header (migration guide §4, `advertiserId` → removed).",
      "Created in PAUSED (the only state Amazon accepts on DSP campaign create); update `state` to ENABLED to deliver.",
      "Campaign dates come from `flights[]` — `startDateTime` / `endDateTime` are read-only on the campaign.",
      "Budgets are `budgets[]` of `{ budgetType: 'MONETARY', budgetValue: { monetaryBudgetValue: { monetaryBudget: { value } } }, recurrenceTimePeriod: 'DAILY' | 'LIFETIME' | 'MONTHLY' }`.",
      "No Unified delete and no ARCHIVED update state: `amazon_dsp_delete_entity` archives an order through the LEGACY `PUT /dsp/orders/{id}` call (unverified).",
      ...COMMON_NOTES,
    ],
  },
  lineItem: {
    canonicalType: "lineItem",
    displayName: "Ad Group / Line Item",
    idField: "adGroupId",
    unified: {
      resource: "adGroups",
      itemKey: "adGroup",
      idField: "adGroupId",
      idFilter: "adGroupIdFilter",
      adProductFilter: true,
      maxResults: 100,
      writeBatchMax: 20,
      filterKeys: {
        adGroupId: "adGroupIdFilter",
        lineItemId: "adGroupIdFilter",
        campaignId: "campaignIdFilter",
        orderId: "campaignIdFilter",
        state: "stateFilter",
      },
      operations: {
        query: "DSPQueryAdGroup",
        create: "DSPCreateAdGroup",
        update: "DSPUpdateAdGroup",
      },
    },
    legacyFieldRenames: { orderId: "campaignId" },
    createStateMustBe: "PAUSED",
    legacyArchive: {
      pathTemplate: "/dsp/lineItems/{entityId}",
      mediaType: "application/vnd.dsplineitems.v3.1+json",
    },
    requiredOnCreate: [
      { field: "name", expectedType: "string" },
      {
        field: "campaignId",
        expectedType: "string",
        hint: "Parent campaign (order) ID; legacy `orderId` is accepted",
      },
      { field: "advertisedProductCategoryIds", expectedType: "array" },
      { field: "bid", expectedType: "object", hint: "{ baseBid: number, maxAverageBid?: number }" },
      { field: "creativeRotationType", expectedType: "string" },
      { field: "inventoryType", expectedType: "string" },
      { field: "optimization", expectedType: "object", hint: "{ bidStrategy }" },
      { field: "pacing", expectedType: "object", hint: "{ deliveryProfile }" },
      { field: "startDateTime", expectedType: "string", hint: "ISO 8601 date-time" },
      { field: "endDateTime", expectedType: "string", hint: "ISO 8601 date-time" },
      { field: "targetingSettings", expectedType: "object" },
    ],
    readOnlyFields: ["adGroupId", "creationDateTime", "lastUpdatedDateTime", "status"],
    readOnlyNestedPaths: [
      "bid.currencyCode",
      "budgets.budgetValue.monetaryBudgetValue.monetaryBudget.currencyCode",
      "fees.currencyCode",
      "fees.feeValueType",
      "targetingSettings.siteLanguage",
    ],
    createFields: [
      "adProduct",
      "advertisedProductCategoryIds",
      "bid",
      "budgets",
      "campaignId",
      "creativeRotationType",
      "endDateTime",
      "fees",
      "frequencies",
      "inventoryType",
      "name",
      "optimization",
      "pacing",
      "purchaseOrderNumber",
      "startDateTime",
      "state",
      "tags",
      "targetingSettings",
    ],
    notes: [
      "A `lineItem` is a Unified DSP ad group (`/adsApi/v1/*/adGroups`); its ID field is `adGroupId` and its parent is `campaignId`.",
      "Created in PAUSED (the only state Amazon accepts on DSP ad group create); update `state` to ENABLED to deliver.",
      "`campaignId` and `inventoryType` are not updatable (absent from `DSPAdGroupUpdate`).",
      "No Unified delete and no ARCHIVED update state: `amazon_dsp_delete_entity` archives a line item through the LEGACY `PUT /dsp/lineItems/{id}` call (unverified).",
      ...COMMON_NOTES,
    ],
  },
  creative: {
    canonicalType: "creative",
    displayName: "Creative / Ad",
    idField: "adId",
    unified: {
      resource: "ads",
      itemKey: "ad",
      idField: "adId",
      idFilter: "adIdFilter",
      adProductFilter: true,
      maxResults: 100,
      writeBatchMax: 10,
      filterKeys: { adId: "adIdFilter", creativeId: "adIdFilter" },
      operations: { query: "DSPQueryAd", create: "DSPCreateAd", update: "DSPUpdateAd" },
    },
    legacyFieldRenames: {},
    deleteUnsupportedReason:
      "the Unified DSP API has no delete for ads (only targets and ad associations) and its update state enum has no ARCHIVED; the pre-#234 PUT /dsp/creatives/{id} was never routable (creative writes were subtype-routed). Remove the ad from delivery by deleting its creativeAssociation, or pause it with amazon_dsp_bulk_update_status.",
    requiredOnCreate: [
      { field: "name", expectedType: "string" },
      {
        field: "adType",
        expectedType: "string",
        hint: "AUDIO | COMPONENT | DISPLAY | THIRD_PARTY | VIDEO",
      },
      {
        field: "creative",
        expectedType: "object",
        hint: "exactly one of { audioCreative | componentCreative | displayCreative | thirdPartyCreative | videoCreative }",
      },
      { field: "state", expectedType: "string", hint: "ENABLED | PAUSED" },
    ],
    readOnlyFields: [
      "adId",
      "creationDateTime",
      "lastUpdatedDateTime",
      "marketplaceScope",
      "status",
    ],
    readOnlyNestedPaths: [],
    createFields: ["adProduct", "adType", "creative", "marketplaces", "name", "state", "tags"],
    notes: [
      "A `creative` is a Unified DSP ad (`/adsApi/v1/*/ads`); its ID field is `adId`. The ad carries the creative (`adType` + one `creative` oneOf key).",
      "Link an ad to an ad group with a `creativeAssociation` (Unified ad association).",
      "`DSPQueryAdRequest` filters by `adIdFilter` only — list an ad group's ads through `creativeAssociation` with `filters.adGroupId`.",
      ...COMMON_NOTES,
    ],
  },
  target: {
    canonicalType: "target",
    displayName: "Target",
    idField: "targetId",
    unified: {
      resource: "targets",
      itemKey: "target",
      idField: "targetId",
      adProductFilter: true,
      maxResults: 5000,
      writeBatchMax: 1000,
      filterKeys: {
        adGroupId: "adGroupIdFilter",
        lineItemId: "adGroupIdFilter",
        state: "stateFilter",
        targetType: "targetTypeFilter",
      },
      deleteIdsKey: "targetIds",
      operations: { query: "DSPQueryTarget", create: "DSPCreateTarget", delete: "DSPDeleteTarget" },
    },
    legacyFieldRenames: { lineItemId: "adGroupId" },
    getUnsupportedReason:
      "`DSPQueryTargetRequest` has no targetId filter, so a single target cannot be read by ID. List an ad group's targets with amazon_dsp_list_entities (entityType `target`, filters.adGroupId).",
    updateUnsupportedReason:
      "the Unified DSP spec has no update operation for targets (create, query and delete only). Delete the target and create a replacement.",
    requiredOnCreate: [
      {
        field: "adGroupId",
        expectedType: "string",
        hint: "Parent ad group (line item) ID; legacy `lineItemId` is accepted",
      },
      { field: "negative", expectedType: "boolean" },
      { field: "state", expectedType: "string", hint: "ENABLED | PAUSED" },
      {
        field: "targetType",
        expectedType: "string",
        hint: "e.g. AUDIENCE, DEVICE, DOMAIN, LOCATION, PRODUCT_CATEGORY",
      },
      {
        field: "targetDetails",
        expectedType: "object",
        hint: "exactly one `<type>Target` key, e.g. { audienceTarget: { audienceId: { defaultValue }, groupId } }",
      },
    ],
    readOnlyFields: [
      "targetId",
      "creationDateTime",
      "lastUpdatedDateTime",
      "status",
      "targetLevel",
    ],
    readOnlyNestedPaths: [
      "targetDetails.domainTarget.domainTargetDetails.domainFileTarget.domainFileId",
      "targetDetails.domainTarget.domainTargetDetails.domainFileTarget.domainFileUrl",
      "targetDetails.productTarget.product.marketplaceSettings",
    ],
    createFields: ["adGroupId", "adProduct", "negative", "state", "targetDetails", "targetType"],
    notes: [
      "A `target` is a Unified DSP target (`/adsApi/v1/*/targets`) scoped to an ad group (`adGroupId`).",
      "The target type is both the top-level `targetType` enum and the single key inside `targetDetails` (migration guide §6: no `targetType` inside the detail object).",
      "Targets cannot be updated or read one-by-one on the Unified DSP surface; delete is `POST /adsApi/v1/delete/targets { targetIds }`.",
      ...COMMON_NOTES,
    ],
  },
  creativeAssociation: {
    canonicalType: "creativeAssociation",
    displayName: "Creative Association / Ad Association",
    idField: "adAssociationId",
    unified: {
      resource: "adAssociations",
      itemKey: "adAssociation",
      idField: "adAssociationId",
      idFilter: "adAssociationIdFilter",
      adProductFilter: false,
      maxResults: 100,
      writeBatchMax: 20,
      filterKeys: {
        adAssociationId: "adAssociationIdFilter",
        adGroupId: "adGroupIdFilter",
        lineItemId: "adGroupIdFilter",
        adId: "adIdFilter",
        creativeId: "adIdFilter",
      },
      deleteIdsKey: "adAssociationIds",
      operations: {
        query: "DSPQueryAdAssociation",
        create: "DSPCreateAdAssociation",
        update: "DSPUpdateAdAssociation",
        delete: "DSPDeleteAdAssociation",
      },
    },
    legacyFieldRenames: { lineItemId: "adGroupId", creativeId: "adId" },
    requiredOnCreate: [
      {
        field: "adGroupId",
        expectedType: "string",
        hint: "Ad group (line item) ID; legacy `lineItemId` is accepted",
      },
      {
        field: "adId",
        expectedType: "string",
        hint: "Ad (creative) ID; legacy `creativeId` is accepted",
      },
      { field: "state", expectedType: "string", hint: "ENABLED | PAUSED" },
    ],
    readOnlyFields: ["adAssociationId"],
    readOnlyNestedPaths: [],
    createFields: ["adGroupId", "adId", "endDateTime", "startDateTime", "state", "weight"],
    notes: [
      "A `creativeAssociation` is a Unified DSP ad association (`/adsApi/v1/*/adAssociations`) linking an ad (`adId`) to an ad group (`adGroupId`).",
      "`DSPQueryAdAssociationRequest` takes no `adProductFilter`.",
      ...COMMON_NOTES,
    ],
  },
};

export const AMAZON_DSP_CANONICAL_ENTITY_TYPES = Object.keys(
  AMAZON_DSP_ENTITY_CONTRACT
) as AmazonDspCanonicalEntityType[];

/**
 * Amazon DSP Reporting API contract (DSP reports v3, account-scoped).
 *
 * Source: Amazon's official Postman collection,
 * github.com/amzn/ads-advanced-tools-docs `postman/Amazon_Ads_API.postman_collection.json`
 * → Reporting / DSP report ("Request DSP report", "DSP report status"; doc link
 * advertising.amazon.com/API/docs/en-us/dsp-reports-beta-3p/#/Reports):
 *   POST {api_url}/accounts/{dspAccountId}/dsp/reports
 *     Accept: application/vnd.dspcreatereports.v3+json, Content-Type: application/json
 *     body { startDate: "2023-02-21", endDate: "2023-02-27", type: "CAMPAIGN",
 *            dimensions: ["ORDER","LINE_ITEM","CREATIVE"], metrics: ["impressions", …] }
 *   GET  {api_url}/accounts/{dspAccountId}/dsp/reports/{reportId}
 *     Accept: application/vnd.dspgetreports.v3+json
 * The 2026-05-15 live run (docs/plans/2026-05-15-amazon-dsp-live-test-findings.md)
 * also recorded `POST /accounts/{accountId}/dsp/reports` with the create
 * media type returning 202, and that `accountId` is the DSP advertiser ID
 * (not the profile ID).
 *
 * NOT to be confused with the Sponsored Ads v3 Reporting API at
 * `/reporting/reports` — that endpoint uses a `configuration{adProduct,
 * reportTypeId, groupBy, columns, format}` envelope and does NOT accept DSP
 * report types.
 */
export const AMAZON_DSP_REPORTING_CONTRACT = {
  submitPathTemplate: "/accounts/{accountId}/dsp/reports",
  statusPathTemplate: "/accounts/{accountId}/dsp/reports/{reportId}",
  submitAccept: "application/vnd.dspcreatereports.v3+json",
  statusAccept: "application/vnd.dspgetreports.v3+json",
  /** Status values (Postman examples show IN_PROGRESS and SUCCESS). */
  statuses: ["IN_PROGRESS", "SUCCESS", "FAILURE"] as const,
  defaultTimeUnit: "DAILY" as const,
  /** Allowed `type` values (one Postman example per type). */
  reportTypes: [
    "CAMPAIGN",
    "INVENTORY",
    "AUDIENCE",
    "PRODUCTS",
    "TECHNOLOGY",
    "GEOGRAPHY",
    "CONVERSION_SOURCE",
  ] as const,
  /**
   * `dimensions` values as used in Amazon's Postman example for each type.
   * Examples, not an exhaustive catalog.
   */
  dimensionsByType: {
    CAMPAIGN: ["ORDER", "LINE_ITEM", "CREATIVE"] as const,
    INVENTORY: ["SUPPLY", "DEAL"] as const,
    AUDIENCE: ["ORDER", "LINE_ITEM"] as const,
    PRODUCTS: ["ORDER", "LINE_ITEM"] as const,
    TECHNOLOGY: [
      "ORDER",
      "LINE_ITEM",
      "OPERATING_SYSTEM",
      "BROWSER_TYPE",
      "BROWSER_VERSION",
      "DEVICE_TYPE",
      "ENVIRONMENT_TYPE",
    ] as const,
    GEOGRAPHY: [
      "ORDER",
      "LINE_ITEM",
      "COUNTRY",
      "STATE_COUNTY_REGION",
      "CITY",
      "DMA",
      "POSTAL_CODE",
    ] as const,
    CONVERSION_SOURCE: ["ORDER", "LINE_ITEM", "CREATIVE"] as const,
  },
  /**
   * A sample of metric names present in Amazon's Postman CAMPAIGN example
   * (which lists 432). The API surfaces an authoritative invalid-list in 422
   * errors, so use that for runtime validation rather than this list.
   */
  knownMetrics: [
    "impressions",
    "clickThroughs",
    "totalCost",
    "viewableImpressions",
    "viewabilityRate",
    "eCPM",
    "eCPC",
    "videoStart",
    "videoFirstQuartile",
    "videoMidpoint",
    "videoThirdQuartile",
    "videoComplete",
    "dpv14d",
    "purchases14d",
    "sales14d",
    "newToBrandPurchases14d",
    "totalPurchases14d",
    "totalSales14d",
  ],
  notes: [
    "POST /accounts/{accountId}/dsp/reports body shape: { startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), type (one of reportTypes), dimensions?: string[], metrics?: string[], timeUnit?: 'DAILY' | 'SUMMARY' }.",
    "`accountId` in the path is the DSP advertiser ID (`advertiserId` from amazon_dsp_list_advertisers) — not the profile ID sent in Amazon-Advertising-API-Scope.",
    "Send Accept: application/vnd.dspcreatereports.v3+json on submit and Accept: application/vnd.dspgetreports.v3+json on status; Content-Type is plain application/json.",
    "Returns 202 with { reportId, type, format:'JSON', status:'IN_PROGRESS', location:'', expiration } — poll GET /accounts/{accountId}/dsp/reports/{reportId} until status === 'SUCCESS' (returns presigned S3 download `location`) or 'FAILURE'.",
    "`timeUnit` does not appear in Amazon's Postman DSP report examples; this server sends DAILY unless SUMMARY is requested.",
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
