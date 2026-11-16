// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import type { RestliQueryParams } from "../../../services/linkedin/restli-query.js";

/**
 * LinkedIn Entity Mapping
 *
 * LinkedIn's VERSIONED Marketing APIs live under `/rest/`. `/v2/` is the legacy
 * unversioned path and returns 410 Gone / 404 Not Found for migrated products
 * (#210). The two differ structurally, not just by prefix:
 *
 *   /v2/adCampaigns?q=search&accounts=List(urn%3Ali%3AsponsoredAccount%3A123)
 *   /rest/adAccounts/123/adCampaigns?q=search
 *
 * The ad account moves OUT of the query string and INTO the path. A constant
 * `apiPath` string cannot express that, which is why this file now models the
 * collection path as a function of the account id and `listScopingParam` is
 * gone.
 *
 * Every entity's collection (list / create) and item (get / update / delete)
 * is on `/rest/` (#210). Every item path but the ad account's own embeds the
 * owning account, in the path or as a query parameter, so the item tools take
 * an `adAccountUrn` — see `itemRequest`. Creatives are on the Creatives API's
 * simplified schema (`content`, `intendedStatus`), not adCreativesV2.
 *
 * NONE OF THESE PATHS HAVE BEEN EXERCISED AGAINST LINKEDIN. The item paths are
 * read off LinkedIn's Marketing API pages (`linkedin.*` platform facts, read
 * 2026-10-01 and 2026-11-14); no call has been made with them.
 */

export type LinkedInEntityType =
  | "adAccount"
  | "campaignGroup"
  | "campaign"
  | "creative"
  | "conversionRule";

export interface LinkedInEntityConfig {
  /**
   * Collection path for this entity.
   *
   * Account-scoped entities take the ad account's NUMERIC id (not the URN) and
   * embed it in the path. Non-scoped entities ignore the argument.
   */
  collectionPath: (adAccountId?: string) => string;
  /** True when {@link collectionPath} embeds an ad account id in the PATH. */
  accountScoped: boolean;
  /**
   * Query parameter that scopes a list to an ad account, for an entity whose
   * collection is not account-scoped in the path (`conversionRule`). Where the
   * account is in the path (`accountScoped`), this is unset.
   */
  listScopingParam?: { name: "account" };
  /**
   * The finder a list call names in `q`, and how it pages: `cursor` sends
   * `pageSize`/`pageToken` and reads `metadata.nextPageToken` (at most
   * `maxPageSize` per page), `none` sends neither and gets every element in one
   * response. LinkedIn names finders per resource, and a wrong name 404s with
   * "No virtual resource found" (#301). No finder this server calls pages by
   * offset: the search finders moved to cursors at version 202401.
   */
  listFinder: LinkedInListFinder;
  /** Display name for messages */
  displayName: string;
  /** Default fields to request when listing/getting */
  defaultFields: string[];
  /**
   * The request a get / update / delete of one entity goes to.
   *
   * A LinkedIn URN does not carry its owning account, and every item path but
   * the ad account's own needs it, so the caller supplies `adAccountUrn`.
   */
  itemRequest: (entityUrn: string, adAccountUrn: string | undefined) => LinkedInItemRequest;
}

/** How a list finder pages (see `listFinder`). */
export type LinkedInListPaging = "cursor" | "none";

/** A list finder: its `q` name and how it pages (see `listFinder`). */
export type LinkedInListFinder =
  | { name: string; paging: "cursor"; maxPageSize: number }
  | { name: string; paging: "none" };

/**
 * The `search` finder of ad accounts, campaign groups and campaigns: cursor
 * paging since version 202401, `pageSize` default 100 and max 1,000 (LinkedIn's
 * Ad Accounts, Campaign Groups, Campaigns and Cursor-based Pagination pages,
 * read 2026-11-16).
 */
const SEARCH_FINDER: LinkedInListFinder = { name: "search", paging: "cursor", maxPageSize: 1000 };

/** One entity's item path, plus the query parameters it needs (conversions take `account`). */
export interface LinkedInItemRequest {
  path: string;
  query?: RestliQueryParams;
}

const ENTITY_CONFIGS: Record<LinkedInEntityType, LinkedInEntityConfig> = {
  adAccount: {
    collectionPath: () => "/rest/adAccounts",
    accountScoped: false,
    listFinder: SEARCH_FINDER,
    displayName: "Ad Account",
    defaultFields: ["id", "name", "status", "currency", "type", "reference"],
    // `/rest/adAccounts/{adAccountID}` — the NUMERIC id, not the encoded URN.
    itemRequest: (entityUrn, adAccountUrn) => {
      const id = adAccountIdFromUrn(entityUrn);
      if (adAccountUrn !== undefined && adAccountIdFromUrn(adAccountUrn) !== id) {
        throw new McpError(
          JsonRpcErrorCode.InvalidParams,
          `adAccountUrn ${adAccountUrn} names a different ad account than entityUrn ${entityUrn}. ` +
            `For an adAccount the entityUrn is the account; omit adAccountUrn or pass the same one.`
        );
      }
      return { path: `/rest/adAccounts/${id}` };
    },
  },
  campaignGroup: {
    collectionPath: (id) =>
      `/rest/adAccounts/${requireAccountId(id, "campaignGroup")}/adCampaignGroups`,
    // `/rest/adAccounts/{adAccountId}/adCampaignGroups/{adCampaignGroupId}`.
    itemRequest: (entityUrn, adAccountUrn) => ({
      path: `/rest/adAccounts/${itemAccountId(adAccountUrn, "campaignGroup")}/adCampaignGroups/${numericIdFromUrn(entityUrn, "li", "sponsoredCampaignGroup")}`,
    }),
    accountScoped: true,
    listFinder: SEARCH_FINDER,
    displayName: "Campaign Group",
    defaultFields: ["id", "name", "status", "account", "totalBudget", "runSchedule"],
  },
  campaign: {
    collectionPath: (id) => `/rest/adAccounts/${requireAccountId(id, "campaign")}/adCampaigns`,
    // `/rest/adAccounts/{adAccountId}/adCampaigns/{campaignID}`.
    itemRequest: (entityUrn, adAccountUrn) => ({
      path: `/rest/adAccounts/${itemAccountId(adAccountUrn, "campaign")}/adCampaigns/${numericIdFromUrn(entityUrn, "li", "sponsoredCampaign")}`,
    }),
    accountScoped: true,
    listFinder: SEARCH_FINDER,
    displayName: "Campaign",
    defaultFields: [
      "id",
      "name",
      "status",
      "campaignGroup",
      "type",
      "objectiveType",
      "dailyBudget",
      "totalBudget",
      "bidType",
      "unitCost",
      "runSchedule",
    ],
  },
  creative: {
    // The Creatives API (it replaces adCreativesV2):
    // `/rest/adAccounts/{adAccountId}/creatives`, searched with the `criteria`
    // finder and cursor paging (pageSize max 100). The create body carries no
    // account (`account` is read-only), so the path comes from adAccountUrn.
    collectionPath: (id) => `/rest/adAccounts/${requireAccountId(id, "creative")}/creatives`,
    accountScoped: true,
    listFinder: { name: "criteria", paging: "cursor", maxPageSize: 100 },
    // Item calls key on the URL-encoded URN, not the numeric id.
    itemRequest: (entityUrn, adAccountUrn) => ({
      path: `/rest/adAccounts/${itemAccountId(adAccountUrn, "creative")}/creatives/${encodeURIComponent(`urn:li:sponsoredCreative:${numericIdFromUrn(entityUrn, "li", "sponsoredCreative")}`)}`,
    }),
    displayName: "Creative",
    defaultFields: ["id", "name", "intendedStatus", "campaign", "account", "content", "review"],
  },
  conversionRule: {
    // list and create are on /rest/conversions (#301). The item path is
    // `/rest/conversions/{conversionId}?account={sponsoredAccountUrn}` (#210):
    // the numeric id in the path and the account as a query parameter.
    collectionPath: () => "/rest/conversions",
    itemRequest: (entityUrn, adAccountUrn) => ({
      path: `/rest/conversions/${numericIdFromUrn(entityUrn, "lla", "llaPartnerConversion")}`,
      query: { account: itemAccountUrn(adAccountUrn, "conversionRule") },
    }),
    accountScoped: false,
    // Find Conversion Rules by Ad Account: `GET /rest/conversions?q=account&account={urn}`.
    // The `account` finder takes no paging parameters (a `pageSize` is rejected
    // 400 QUERY_PARAM_NOT_ALLOWED) and the response carries no `paging`.
    listScopingParam: { name: "account" },
    listFinder: { name: "account", paging: "none" },
    displayName: "Conversion Rule",
    defaultFields: [
      "id",
      "name",
      "type",
      "account",
      "enabled",
      "conversionMethod",
      "attributionType",
    ],
  },
};

/**
 * The numeric ad account id LinkedIn's `/rest/adAccounts/{id}/…` paths expect.
 *
 * Callers hold URNs (`urn:li:sponsoredAccount:123`), and the path wants `123`.
 * A URN interpolated whole would produce `/rest/adAccounts/urn:li:…/adCampaigns`,
 * which is a 404 that looks like a missing entity rather than a bug here.
 */
export function adAccountIdFromUrn(adAccountUrn: string): string {
  const match = /^urn:li:sponsoredAccount:(\d+)$/.exec(adAccountUrn.trim());
  if (match) return match[1];
  if (/^\d+$/.test(adAccountUrn.trim())) return adAccountUrn.trim();
  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Expected an ad account URN like "urn:li:sponsoredAccount:123" or a numeric id, got ${JSON.stringify(adAccountUrn)}`
  );
}

/**
 * The numeric id of an entity URN (`urn:li:sponsoredCampaign:77` → `77`), or a
 * bare numeric id as given.
 *
 * A URN of another entity type is refused: `urn:li:sponsoredCampaign:7` sent as
 * a campaign group would address campaign group 7, a different entity.
 */
function numericIdFromUrn(urn: string, namespace: "li" | "lla", urnType: string): string {
  const trimmed = urn.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = new RegExp(`^urn:${namespace}:${urnType}:(\\d+)$`).exec(trimmed);
  if (match) return match[1];
  throw new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Expected a URN like "urn:${namespace}:${urnType}:123" or a numeric id, got ${JSON.stringify(urn)}`
  );
}

/** The `adAccountUrn` an item path needs, refused by name when it is missing. */
function itemAccountUrn(adAccountUrn: string | undefined, entityType: string): string {
  if (adAccountUrn === undefined || adAccountUrn.trim() === "") {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `A ${entityType} is addressed under its ad account on LinkedIn's versioned API, so ` +
        `adAccountUrn (e.g. "urn:li:sponsoredAccount:123") is required. See #210.`
    );
  }
  // Validates the form, and normalizes a bare id to the URN the query expects.
  return `urn:li:sponsoredAccount:${adAccountIdFromUrn(adAccountUrn)}`;
}

function itemAccountId(adAccountUrn: string | undefined, entityType: string): string {
  return adAccountIdFromUrn(itemAccountUrn(adAccountUrn, entityType));
}

/** The get / update / delete request for one entity. */
export function entityItemRequest(
  entityType: LinkedInEntityType,
  entityUrn: string,
  adAccountUrn: string | undefined
): LinkedInItemRequest {
  return getEntityConfig(entityType).itemRequest(entityUrn, adAccountUrn);
}

/** Every entity's item path but the ad account's own needs the owning account. */
export function itemRequiresAdAccount(entityType: LinkedInEntityType): boolean {
  return entityType !== "adAccount";
}

function requireAccountId(adAccountId: string | undefined, entityType: string): string {
  if (!adAccountId) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `LinkedIn's versioned API scopes ${entityType} under an ad account ` +
        `(/rest/adAccounts/{id}/…), so an ad account is required. See #210.`
    );
  }
  return adAccountId;
}

export function getEntityConfig(entityType: LinkedInEntityType): LinkedInEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unknown LinkedIn entity type: ${entityType}`
    );
  }
  return config;
}

export function getSupportedEntityTypes(): LinkedInEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as LinkedInEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

/**
 * Entity types that cannot be listed without an ad account.
 *
 * Deliberately NOT the same question as `accountScoped`. For most entities the
 * account sits in the path; for a conversion rule it is a query parameter.
 * Both mean the caller must supply one, and `list-entities.tool.ts` only cares
 * about that. Deriving this from `accountScoped` alone would silently stop
 * requiring an account for `conversionRule`.
 *
 * Derived from the configs so it cannot drift from them by hand.
 */
export const ACCOUNT_SCOPED_ENTITY_TYPES: LinkedInEntityType[] = (
  Object.keys(ENTITY_CONFIGS) as LinkedInEntityType[]
).filter((type) => listRequiresAccount(ENTITY_CONFIGS[type]));

function listRequiresAccount(config: LinkedInEntityConfig): boolean {
  return config.accountScoped || config.listScopingParam !== undefined;
}

export function isAccountScopedEntity(entityType: LinkedInEntityType): boolean {
  return listRequiresAccount(getEntityConfig(entityType));
}
