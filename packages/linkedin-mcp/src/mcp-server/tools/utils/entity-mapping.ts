// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";

/**
 * LinkedIn Entity Mapping
 *
 * LinkedIn's VERSIONED Marketing APIs live under `/rest/`. `/v2/` is the legacy
 * unversioned path and returns 410 Gone / 404 Not Found for migrated products
 * (#210). The two differ structurally, not just by prefix:
 *
 *   /v2/adCampaigns?q=search&accounts[0]=urn:li:sponsoredAccount:123
 *   /rest/adAccounts/123/adCampaigns?q=search
 *
 * The ad account moves OUT of the query string and INTO the path. A constant
 * `apiPath` string cannot express that, which is why this file now models the
 * collection path as a function of the account id and `listScopingParam` is
 * gone.
 *
 * THIS MIGRATION IS STAGED, AND THE STATE IS IN THE TYPES ON PURPOSE
 *
 * `apiSurface` records, per entity, whether it has actually been moved. Entities
 * still on `"legacy-v2"` are ones whose migration needs more than a new path:
 * `creative` moves to a *simplified schema* under the Creatives API, so its
 * `defaultFields` and payload mapping have to be rewritten rather than
 * re-pathed. Guessing that model would produce a green mock suite that proves
 * nothing — the exact failure #210 warns about.
 *
 * NONE OF THESE PATHS HAVE BEEN EXERCISED AGAINST LINKEDIN. They are recorded in
 * platform-facts.json as `unverified` with the basis for each. `api.linkedin.com`
 * is unreachable from this repo's egress policy and no advertiser credentials
 * exist here, so this change is a structural migration, NOT a working server.
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
   * Legacy `/v2/` query parameter that scopes a list to an ad account.
   *
   * Only meaningful while `apiSurface === "legacy-v2"`. Under `/rest/` the
   * account is in the path instead, which is the whole structural change.
   */
  listScopingParam?: "accounts[0]" | "account";
  /** Whether this entity has been migrated to the versioned `/rest/` surface. */
  apiSurface: LinkedInApiSurface;
  /** Display name for messages */
  displayName: string;
  /** Default fields to request when listing/getting */
  defaultFields: string[];
  /**
   * The legacy `/v2/` collection, retained for call shapes that cannot yet
   * express the versioned path.
   *
   * `get`/`update`/`delete` receive an entity URN and nothing else, and a
   * LinkedIn URN does not carry its owning account, so they cannot build
   * `/rest/adAccounts/{id}/…`. They keep using this until the account parameter
   * is added — see the note on `entityItemPath` in linkedin-service.ts.
   *
   * They are NOT converted into hard refusals. That `/v2/` is fully dead for
   * these products is #210's claim, and it is unverified from here: nobody has
   * reached api.linkedin.com. Refusing on an unverified premise would turn a
   * possibly-working call into a guaranteed failure of our own making.
   */
  legacyCollectionPath?: string;
  /** Why this entity is still on `/v2/`, when it is. */
  migrationBlockedBy?: string;
}

const ENTITY_CONFIGS: Record<LinkedInEntityType, LinkedInEntityConfig> = {
  adAccount: {
    collectionPath: () => "/rest/adAccounts",
    accountScoped: false,
    apiSurface: "rest",
    displayName: "Ad Account",
    defaultFields: ["id", "name", "status", "currency", "type", "reference"],
  },
  campaignGroup: {
    collectionPath: (id) =>
      `/rest/adAccounts/${requireAccountId(id, "campaignGroup")}/adCampaignGroups`,
    legacyCollectionPath: "/v2/adCampaignGroups",
    accountScoped: true,
    apiSurface: "rest",
    displayName: "Campaign Group",
    defaultFields: ["id", "name", "status", "account", "totalBudget", "runSchedule"],
  },
  campaign: {
    collectionPath: (id) => `/rest/adAccounts/${requireAccountId(id, "campaign")}/adCampaigns`,
    legacyCollectionPath: "/v2/adCampaigns",
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
    // NOT migrated. The Creatives API replaces adCreativesV2 with a simplified
    // schema — a different model, so `defaultFields` and the create/update
    // payload mapping must be rewritten, not re-pathed. Held until the schema
    // can be read from LinkedIn's reference or exercised against an account.
    collectionPath: () => "/v2/adCreatives",
    accountScoped: false,
    listScopingParam: "accounts[0]",
    apiSurface: "legacy-v2",
    displayName: "Creative",
    defaultFields: ["id", "status", "campaign", "reference", "review"],
    migrationBlockedBy:
      "Creatives API uses a simplified schema, not just a new path — needs a payload/field rewrite (#210)",
  },
  conversionRule: {
    // NOT migrated. #210 lists /v2/conversions -> /rest/conversions as "confirm",
    // and nothing corroborates either the path or how the account scoping is
    // expressed there. Moving it on the strength of the prefix pattern alone
    // would be a guess wearing the costume of a migration.
    collectionPath: () => "/v2/conversions",
    accountScoped: false,
    listScopingParam: "account",
    apiSurface: "legacy-v2",
    displayName: "Conversion Rule",
    defaultFields: ["id", "name", "type", "account", "status", "urlRules"],
    migrationBlockedBy: "/rest/conversions path and account-scoping shape unconfirmed (#210)",
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
