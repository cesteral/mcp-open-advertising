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
 * THIS MIGRATION IS STAGED, AND THE STATE IS IN THE TYPES ON PURPOSE
 *
 * `apiSurface` records, per entity, whether its COLLECTION (list / create) has
 * actually been moved. The one still on `"legacy-v2"` is `creative`: its list
 * and create move to a *simplified schema* under the Creatives API, so its
 * `defaultFields` and create payload have to be rewritten rather than
 * re-pathed.
 *
 * Item paths (get / update / delete) are all on `/rest/` (#210). Every one but
 * the ad account's own embeds the owning account, in the path or as a query
 * parameter, so the item tools take an `adAccountUrn` — see `itemRequest`.
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

/** Which LinkedIn API surface an entity's paths currently target. */
export type LinkedInApiSurface = "rest" | "legacy-v2";

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
   * Query parameter that scopes a list to an ad account, for entities whose
   * collection is not account-scoped in the path (`creative` on legacy `/v2/`,
   * `conversionRule` on `/rest/`). Where the account is in the path
   * (`accountScoped`), this is unset.
   */
  listScopingParam?: { name: "accounts"; list: true } | { name: "account"; list: false };
  /**
   * The finder a list call names in `q`, and whether it takes `start`/`count`.
   * Absent means `q=search` with offset paging, which is what the account-scoped
   * campaign and campaign-group collections and the legacy `/v2/` ones accept.
   * LinkedIn names finders per resource, and a wrong name 404s with "No virtual
   * resource found" (#301).
   */
  listFinder?: { name: string; paged: boolean };
  /** Whether this entity has been migrated to the versioned `/rest/` surface. */
  apiSurface: LinkedInApiSurface;
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
  /** Why this entity's collection is still on `/v2/`, when it is. */
  migrationBlockedBy?: string;
}

/** One entity's item path, plus the query parameters it needs (conversions take `account`). */
export interface LinkedInItemRequest {
  path: string;
  query?: RestliQueryParams;
}

const ENTITY_CONFIGS: Record<LinkedInEntityType, LinkedInEntityConfig> = {
  adAccount: {
    collectionPath: () => "/rest/adAccounts",
    accountScoped: false,
    apiSurface: "rest",
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
    apiSurface: "rest",
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
    apiSurface: "rest",
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
    // List and create are NOT migrated. The Creatives API replaces
    // adCreativesV2 with a simplified schema — a different model, so
    // `defaultFields` and the create payload must be rewritten, not re-pathed.
    collectionPath: () => "/v2/adCreatives",
    // Item calls ARE on the Creatives API (#210):
    // `/rest/adAccounts/{adAccountId}/creatives/{encoded creative URN}`. Unlike
    // campaigns, the key is the URL-encoded URN, not the numeric id. Its status
    // field is `intendedStatus`.
    itemRequest: (entityUrn, adAccountUrn) => ({
      path: `/rest/adAccounts/${itemAccountId(adAccountUrn, "creative")}/creatives/${encodeURIComponent(`urn:li:sponsoredCreative:${numericIdFromUrn(entityUrn, "li", "sponsoredCreative")}`)}`,
    }),
    accountScoped: false,
    // A one-element array, serialized as Rest.li 2.0 `accounts=List(urn%3A…)`.
    // The old `accounts[0]=` key was the Rest.li 1.0 spelling of the same
    // parameter, sent under a `X-Restli-Protocol-Version: 2.0.0` header.
    listScopingParam: { name: "accounts", list: true },
    apiSurface: "legacy-v2",
    displayName: "Creative",
    defaultFields: ["id", "status", "campaign", "reference", "review"],
    migrationBlockedBy:
      "Creatives API uses a simplified schema, not just a new path — needs a payload/field rewrite (#210)",
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
    listScopingParam: { name: "account", list: false },
    listFinder: { name: "account", paged: false },
    apiSurface: "rest",
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
 * Deliberately NOT the same question as `accountScoped`. Under `/rest/` the
 * account sits in the path; under `/v2/` it is a query parameter. Both mean the
 * caller must supply one, and `list-entities.tool.ts` only cares about that.
 * Deriving this from `accountScoped` alone would have silently stopped requiring
 * an account for `creative` and `conversionRule` the moment they were left
 * behind on `/v2/` — a scoping regression hidden inside a path migration.
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
