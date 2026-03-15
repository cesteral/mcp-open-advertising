// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Entity Example Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type SnapchatEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLE_CONTENT: Record<SnapchatEntityType, string> = {
  campaign: `# Snapchat Campaign Examples

## Create an Awareness Campaign (daily budget)
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "acct_123456",
  "data": {
    "name": "Spring 2024 Awareness Campaign",
    "objective": "AWARENESS",
    "status": "ACTIVE",
    "ad_account_id": "acct_123456",
    "daily_budget_micro": 50000000,
    "start_time": "2024-03-01T00:00:00Z",
    "end_time": "2024-03-31T23:59:59Z"
  }
}
\`\`\`

## Create an App Install Campaign (lifetime budget)
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "acct_123456",
  "data": {
    "name": "App Install Q1 2024",
    "objective": "APP_INSTALLS",
    "status": "PAUSED",
    "ad_account_id": "acct_123456",
    "lifetime_spend_cap_micro": 500000000
  }
}
\`\`\`

## Update Campaign Budget
\`\`\`json
{
  "entityType": "campaign",
  "adAccountId": "acct_123456",
  "entityId": "campaign_abc",
  "data": {
    "daily_budget_micro": 100000000
  }
}
\`\`\`

⚠️ **Budgets are in micro-currency: 1 USD = 1,000,000. $50/day → daily_budget_micro: 50000000**
`,

  adGroup: `# Snapchat Ad Squad (Ad Group) Examples

⚠️ **Ad groups in Snapchat are called "Ad Squads" — entity type "adGroup" maps to API path /adsquads**
⚠️ **List path uses campaignId (/v1/campaigns/{id}/adsquads) but create path uses adAccountId**

## Create an Ad Squad with Targeting
\`\`\`json
{
  "entityType": "adGroup",
  "adAccountId": "acct_123456",
  "data": {
    "name": "18-35 Female Audience",
    "campaign_id": "campaign_abc",
    "status": "ACTIVE",
    "daily_budget_micro": 10000000,
    "bid_micro": 1000000,
    "optimization_goal": "SWIPE",
    "placement": "SNAP_ADS"
  }
}
\`\`\`

## Create a Video Views Ad Squad
\`\`\`json
{
  "entityType": "adGroup",
  "adAccountId": "acct_123456",
  "data": {
    "name": "Video Views - All Ages",
    "campaign_id": "campaign_abc",
    "status": "ACTIVE",
    "daily_budget_micro": 20000000,
    "bid_micro": 500000,
    "optimization_goal": "VIDEO_VIEWS",
    "placement": "BOTH"
  }
}
\`\`\`
`,

  ad: `# Snapchat Ad Examples

## Create a Snap Ad
\`\`\`json
{
  "entityType": "ad",
  "adAccountId": "acct_123456",
  "data": {
    "name": "Spring Sale Ad",
    "ad_squad_id": "adsquad_xyz",
    "creative_id": "creative_123",
    "status": "ACTIVE",
    "type": "SNAP_AD"
  }
}
\`\`\`

## Create a Story Ad
\`\`\`json
{
  "entityType": "ad",
  "adAccountId": "acct_123456",
  "data": {
    "name": "Brand Story Ad",
    "ad_squad_id": "adsquad_xyz",
    "creative_id": "creative_456",
    "status": "ACTIVE",
    "type": "STORY"
  }
}
\`\`\`
`,

  creative: `# Snapchat Creative Examples

## Create a Snap Ad Creative
\`\`\`json
{
  "entityType": "creative",
  "adAccountId": "acct_123456",
  "data": {
    "name": "Spring Sale Creative",
    "type": "SNAP_AD",
    "ad_account_id": "acct_123456",
    "brand_name": "Your Brand",
    "headline": "Shop the Spring Sale",
    "call_to_action": "SHOP_NOW"
  }
}
\`\`\`

## Create an App Install Creative
\`\`\`json
{
  "entityType": "creative",
  "adAccountId": "acct_123456",
  "data": {
    "name": "App Install Creative",
    "type": "APP_INSTALL",
    "ad_account_id": "acct_123456",
    "brand_name": "Your App",
    "headline": "Download our app today",
    "call_to_action": "INSTALL_NOW"
  }
}
\`\`\`
`,
};

function buildAllExamplesMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_EXAMPLE_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entityExampleResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-examples://snapchat/${entityType}`,
  name: `Snapchat ${entityType} Examples`,
  description: `Example payloads for creating and updating Snapchat ${entityType} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_EXAMPLE_CONTENT[entityType] ?? `# Snapchat ${entityType} Examples\n\nNo examples available.\n`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://snapchat/all",
  name: "Snapchat All Entity Examples",
  description: "Combined example payloads for all Snapchat Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllExamplesMarkdown,
};