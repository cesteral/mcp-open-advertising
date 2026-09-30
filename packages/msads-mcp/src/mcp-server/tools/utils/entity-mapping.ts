// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { JsonRpcErrorCode, McpError } from "@cesteral/shared";
import { z } from "zod";

export type MsAdsEntityType =
  | "campaign"
  | "adGroup"
  | "ad"
  | "keyword"
  | "budget"
  | "adExtension"
  | "audience"
  | "label";

export interface MsAdsEntityConfig {
  /** REST operation path for adding entities (POST) */
  addOperation: string;
  /** REST operation path for getting by account ID (POST) */
  getByAccountOperation?: string;
  /** REST operation path for getting by parent entity ID (POST) */
  getByParentOperation?: string;
  /** REST operation path for getting by entity IDs (POST) */
  getByIdsOperation: string;
  /** REST operation path for updating entities (POST) */
  updateOperation: string;
  /** REST operation path for deleting entities (POST) */
  deleteOperation: string;
  /** Primary ID field in the response object */
  idField: string;
  /** Parent ID field (e.g., CampaignId for adGroups) */
  parentIdField?: string;
  /** Plural name for the entity (used as response/request key) */
  pluralName: string;
  /** Singular display name */
  displayName: string;
  /** Request body key for entity ID arrays (e.g., "CampaignIds") */
  idsField: string;
  /** Batch limit for add/update operations */
  batchLimit: number;
  /** Additional required request body fields when querying by IDs */
  requiredGetByIdsFields?: string[];
  /**
   * Whether this entity type can be duplicated via the read+create clone
   * pattern. Only `campaign` (account-scoped, self-contained Add payload) is
   * currently supported.
   */
  supportsDuplicate?: boolean;
  /**
   * Request-body element the Add / Update / Delete operation requires next to
   * the entity array, identifying the parent the entities belong to. Per the v13
   * Campaign Management docs (`addcampaigns.md` / `updatecampaigns.md`:
   * `AccountId`; `addadgroups.md` / `updateadgroups.md`: `CampaignId`;
   * `addads.md` / `updateads.md` / `addkeywords.md` / `updatekeywords.md`:
   * `AdGroupId`; `addadextensions.md` / `updateadextensions.md`: `AccountId`).
   * Budgets, audiences and labels take no parent element — the account comes
   * from the `CustomerAccountId` header.
   */
  writeParentIdField?: MsAdsWriteParentIdField;
  /**
   * Extra request-body fields sent on every read of this entity type unless
   * the caller supplies them. Used for `CampaignType` on campaign reads, which
   * otherwise default to Search campaigns only.
   */
  defaultReadFields?: Record<string, unknown>;
}

export type MsAdsWriteParentIdField = "AccountId" | "CampaignId" | "AdGroupId";

/**
 * Every campaign type, in the REST encoding of the `CampaignType` flags enum.
 *
 * GetCampaignsByAccountId / GetCampaignsByIds return only Search campaigns when
 * `CampaignType` is not set (`getcampaignsbyaccountid.md`, `getcampaignsbyids.md`:
 * "If you do not set any campaign type, the default value is Search"), and
 * GetCampaignsByIds returns `EntityIdFilterMismatch` for an ID of another type.
 * REST sends flag enums as one comma-separated string: the official Python SDK
 * 13.0.29 serializes its `CampaignType` Flag via `to_json()` → `", ".join(names)`
 * (`openapi_client/models/campaign/campaign_type.py`, `api_client.py`
 * `sanitize_for_serialization`). The list is that SDK enum's members.
 * `ObjectiveBased` (listed in `campaigntype.md`) is deliberately left out: the
 * current SDK does not send it, so REST acceptance is unverified, and one
 * unknown flag would fail every campaign read.
 */
export const MSADS_ALL_CAMPAIGN_TYPES =
  "Search, Shopping, DynamicSearchAds, Audience, Hotel, PerformanceMax, App";

const ENTITY_CONFIGS: Record<MsAdsEntityType, MsAdsEntityConfig> = {
  campaign: {
    addOperation: "/Campaigns",
    getByAccountOperation: "/Campaigns/QueryByAccountId",
    getByIdsOperation: "/Campaigns/QueryByIds",
    updateOperation: "/Campaigns",
    deleteOperation: "/Campaigns",
    idField: "Id",
    pluralName: "Campaigns",
    displayName: "Campaign",
    idsField: "CampaignIds",
    batchLimit: 100,
    requiredGetByIdsFields: ["AccountId"],
    supportsDuplicate: true,
    writeParentIdField: "AccountId",
    defaultReadFields: { CampaignType: MSADS_ALL_CAMPAIGN_TYPES },
  },
  adGroup: {
    addOperation: "/AdGroups",
    getByParentOperation: "/AdGroups/QueryByCampaignId",
    getByIdsOperation: "/AdGroups/QueryByIds",
    updateOperation: "/AdGroups",
    deleteOperation: "/AdGroups",
    idField: "Id",
    parentIdField: "CampaignId",
    pluralName: "AdGroups",
    displayName: "Ad Group",
    idsField: "AdGroupIds",
    batchLimit: 1000,
    requiredGetByIdsFields: ["CampaignId"],
    writeParentIdField: "CampaignId",
  },
  ad: {
    addOperation: "/Ads",
    getByParentOperation: "/Ads/QueryByAdGroupId",
    getByIdsOperation: "/Ads/QueryByIds",
    updateOperation: "/Ads",
    deleteOperation: "/Ads",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Ads",
    displayName: "Ad",
    idsField: "AdIds",
    batchLimit: 50,
    requiredGetByIdsFields: ["AdGroupId"],
    writeParentIdField: "AdGroupId",
  },
  keyword: {
    addOperation: "/Keywords",
    getByParentOperation: "/Keywords/QueryByAdGroupId",
    getByIdsOperation: "/Keywords/QueryByIds",
    updateOperation: "/Keywords",
    deleteOperation: "/Keywords",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Keywords",
    displayName: "Keyword",
    idsField: "KeywordIds",
    batchLimit: 1000,
    requiredGetByIdsFields: ["AdGroupId"],
    writeParentIdField: "AdGroupId",
  },
  budget: {
    addOperation: "/Budgets",
    getByIdsOperation: "/Budgets/QueryByIds",
    updateOperation: "/Budgets",
    deleteOperation: "/Budgets",
    idField: "Id",
    pluralName: "Budgets",
    displayName: "Budget",
    idsField: "BudgetIds",
    batchLimit: 100,
  },
  adExtension: {
    addOperation: "/AdExtensions",
    getByIdsOperation: "/AdExtensions/QueryByIds",
    updateOperation: "/AdExtensions",
    deleteOperation: "/AdExtensions",
    idField: "Id",
    pluralName: "AdExtensions",
    displayName: "Ad Extension",
    idsField: "AdExtensionIds",
    batchLimit: 100,
    requiredGetByIdsFields: ["AccountId", "AdExtensionType"],
    writeParentIdField: "AccountId",
  },
  audience: {
    addOperation: "/Audiences",
    getByIdsOperation: "/Audiences/QueryByIds",
    updateOperation: "/Audiences",
    deleteOperation: "/Audiences",
    idField: "Id",
    pluralName: "Audiences",
    displayName: "Audience",
    idsField: "AudienceIds",
    batchLimit: 100,
  },
  label: {
    addOperation: "/Labels",
    getByIdsOperation: "/Labels/QueryByIds",
    updateOperation: "/Labels",
    deleteOperation: "/Labels",
    idField: "Id",
    pluralName: "Labels",
    displayName: "Label",
    idsField: "LabelIds",
    batchLimit: 100,
  },
};

export function getEntityConfig(entityType: MsAdsEntityType): MsAdsEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unknown Microsoft Ads entity type: ${entityType}`
    );
  }
  return config;
}

export function getSupportedEntityTypes(): MsAdsEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as MsAdsEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}

/** Entity types that support duplication via the read+create clone pattern. */
export function getDuplicateSupportedEntityTypes(): MsAdsEntityType[] {
  return (Object.entries(ENTITY_CONFIGS) as [MsAdsEntityType, MsAdsEntityConfig][])
    .filter(([, config]) => config.supportsDuplicate)
    .map(([type]) => type);
}

export function getDuplicateEntityTypeEnum(): [string, ...string[]] {
  return getDuplicateSupportedEntityTypes() as [string, ...string[]];
}

/** Tool input key carrying each request-body parent element. */
const PARENT_INPUT_KEYS: Record<MsAdsWriteParentIdField, "accountId" | "campaignId" | "adGroupId"> =
  {
    AccountId: "accountId",
    CampaignId: "campaignId",
    AdGroupId: "adGroupId",
  };

/**
 * The request-body parent element an entity type's Add / Update needs, and the
 * tool input key (`accountId` / `campaignId` / `adGroupId`) that supplies it.
 * Undefined for entity types that take no parent element.
 */
export function getWriteParent(
  entityType: MsAdsEntityType
):
  | { bodyField: MsAdsWriteParentIdField; inputKey: "accountId" | "campaignId" | "adGroupId" }
  | undefined {
  const field = getEntityConfig(entityType).writeParentIdField;
  return field ? { bodyField: field, inputKey: PARENT_INPUT_KEYS[field] } : undefined;
}

/**
 * Validation message when a write for `entityType` lacks its required parent
 * ID, or undefined when the parent is present or not needed.
 */
export function missingWriteParentMessage(
  entityType: MsAdsEntityType,
  parentIds: { accountId?: string; campaignId?: string; adGroupId?: string }
): string | undefined {
  const parent = getWriteParent(entityType);
  if (!parent) return undefined;
  const value = parentIds[parent.inputKey];
  if (typeof value === "string" && value.trim().length > 0) return undefined;
  return `${parent.inputKey} is required for entityType '${entityType}' — Microsoft Ads needs ${parent.bodyField} in the request body next to the ${getEntityConfig(entityType).pluralName} array`;
}

/** Tool input keys that give a by-ID read (and update) its parent context. */
export type MsAdsEntityContextKey = "accountId" | "campaignId" | "adGroupId" | "adExtensionType";

export type MsAdsEntityContext = Partial<Record<MsAdsEntityContextKey, string>>;

const CONTEXT_INPUT_KEYS: Record<string, MsAdsEntityContextKey> = {
  AccountId: "accountId",
  CampaignId: "campaignId",
  AdGroupId: "adGroupId",
  AdExtensionType: "adExtensionType",
};

/**
 * The context inputs `msads_get_entity` / `msads_update_entity` require for
 * `entityType`, besides the entity ID. They are the fields the Get*ByIds read
 * requires (`requiredGetByIdsFields`, which `MsAdsService.getEntity` asserts):
 * campaign AccountId, adGroup CampaignId, ad and keyword AdGroupId, adExtension
 * AccountId + AdExtensionType. Budgets, audiences and labels need none. For
 * every parented type, the read field is also the Update body's parent.
 *
 * Both tools take these as flat optional fields and enforce them per type in
 * `superRefine`, because a top-level discriminated union is published to MCP
 * clients as an empty input schema (#228).
 */
export function getEntityContextKeys(entityType: MsAdsEntityType): MsAdsEntityContextKey[] {
  return (getEntityConfig(entityType).requiredGetByIdsFields ?? []).map((field) => {
    const key = CONTEXT_INPUT_KEYS[field];
    if (!key) throw new Error(`No tool input key for Get*ByIds field ${field}`);
    return key;
  });
}

/**
 * The context fields that apply to `entityType`, taken from `input`. Fields
 * that do not apply to the type are dropped, as the discriminated-union schema
 * these tools used to have stripped them.
 */
export function pickEntityContext(
  entityType: MsAdsEntityType,
  input: MsAdsEntityContext
): MsAdsEntityContext {
  const picked: MsAdsEntityContext = {};
  for (const key of getEntityContextKeys(entityType)) {
    const value = input[key];
    if (typeof value === "string") picked[key] = value;
  }
  return picked;
}

/** Microsoft Ads request parameters for a by-ID read with this context. */
export function entityContextReadParams(context: MsAdsEntityContext): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (context.accountId !== undefined) params.AccountId = Number(context.accountId);
  if (context.campaignId !== undefined) params.CampaignId = Number(context.campaignId);
  if (context.adGroupId !== undefined) params.AdGroupId = Number(context.adGroupId);
  if (context.adExtensionType !== undefined) params.AdExtensionType = context.adExtensionType;
  return params;
}

/** `superRefine` body: one issue per context field `entityType` requires but `input` lacks. */
export function refineEntityContext(
  input: MsAdsEntityContext & { entityType: string },
  ctx: z.RefinementCtx
): void {
  if (!(input.entityType in ENTITY_CONFIGS)) return; // the enum already reported it
  for (const key of getEntityContextKeys(input.entityType as MsAdsEntityType)) {
    const value = input[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when entityType is ${input.entityType}`,
      });
    }
  }
}
