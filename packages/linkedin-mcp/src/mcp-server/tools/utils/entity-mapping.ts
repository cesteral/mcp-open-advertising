// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn Entity Mapping
 *
 * Static configuration for LinkedIn Ads entity types.
 * LinkedIn uses URN IDs (e.g., urn:li:sponsoredAccount:123).
 * Entity IDs must be URL-encoded when used in API path segments.
 */

export type LinkedInEntityType =
  | "adAccount"
  | "campaignGroup"
  | "campaign"
  | "creative"
  | "conversionRule";

export interface LinkedInEntityConfig {
  /** LinkedIn API path (e.g., "/v2/adAccounts") */
  apiPath: string;
  /** Display name for messages */
  displayName: string;
  /** Default fields to request when listing/getting */
  defaultFields: string[];
  /**
   * Query parameter name used to scope a list request to an ad account URN.
   * - `"accounts[0]"` — used by /v2/adCampaigns and /v2/adCreatives
   * - `"account"` — used by /v2/adCampaignGroups and /v2/conversions
   * - `undefined` — entity is not account-scoped (e.g., adAccount itself)
   */
  listScopingParam?: "accounts[0]" | "account";
}

const ENTITY_CONFIGS: Record<LinkedInEntityType, LinkedInEntityConfig> = {
  adAccount: {
    apiPath: "/v2/adAccounts",
    displayName: "Ad Account",
    defaultFields: ["id", "name", "status", "currency", "type", "reference"],
    // no listScopingParam — adAccounts are not scoped by account
  },
  campaignGroup: {
    apiPath: "/v2/adCampaignGroups",
    displayName: "Campaign Group",
    defaultFields: [
      "id", "name", "status", "account", "totalBudget", "runSchedule",
    ],
    listScopingParam: "account", // /v2/adCampaignGroups?q=search&account=<urn>
  },
  campaign: {
    apiPath: "/v2/adCampaigns",
    displayName: "Campaign",
    defaultFields: [
      "id", "name", "status", "campaignGroup", "type", "objectiveType",
      "dailyBudget", "totalBudget", "bidType", "unitCost", "runSchedule",
    ],
    listScopingParam: "accounts[0]", // /v2/adCampaigns?q=search&accounts[0]=<urn>
  },
  creative: {
    apiPath: "/v2/adCreatives",
    displayName: "Creative",
    defaultFields: ["id", "status", "campaign", "reference", "review"],
    listScopingParam: "accounts[0]", // /v2/adCreatives?q=search&accounts[0]=<urn>
  },
  conversionRule: {
    apiPath: "/v2/conversions",
    displayName: "Conversion Rule",
    defaultFields: ["id", "name", "type", "account", "status", "urlRules"],
    listScopingParam: "account", // /v2/conversions?q=search&account=<urn>
  },
};

export function getEntityConfig(entityType: LinkedInEntityType): LinkedInEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown LinkedIn entity type: ${entityType}`);
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
 * Entity types that require an adAccountUrn when listing.
 */
export const ACCOUNT_SCOPED_ENTITY_TYPES: LinkedInEntityType[] = [
  "campaignGroup",
  "campaign",
  "creative",
  "conversionRule",
];

export function isAccountScopedEntity(entityType: LinkedInEntityType): boolean {
  return ACCOUNT_SCOPED_ENTITY_TYPES.includes(entityType);
}