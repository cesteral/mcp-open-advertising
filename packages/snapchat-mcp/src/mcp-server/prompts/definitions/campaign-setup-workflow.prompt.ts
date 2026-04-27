// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "snapchat_campaign_setup_workflow",
  description:
    "Step-by-step guide for creating a complete Snapchat Ads campaign structure (Campaign > Ad Squad > Ad)",
  arguments: [
    {
      name: "adAccountId",
      description: "Snapchat Ad Account ID (e.g., acct_1234567890)",
      required: true,
    },
    {
      name: "objective",
      description: "Campaign objective (e.g., AWARENESS, APP_INSTALLS, WEBSITE_CONVERSIONS)",
      required: false,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const objective = args?.objective || "AWARENESS";

  return `# Snapchat Campaign Setup Workflow

## Prerequisites
- Ad Account ID: \`${adAccountId}\`
- Verify access: \`snapchat_list_ad_accounts\`

## Step 1: Create Campaign

\`\`\`json
snapchat_create_entity({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Campaign Name",
    "objective": "${objective}",
    "status": "PAUSED",
    "ad_account_id": "${adAccountId}",
    "daily_budget_micro": 50000000
  }
})
\`\`\`

**Campaign Objectives:** AWARENESS, APP_INSTALLS, DRIVE_REPLAY, LEAD_GENERATION, WEBSITE_CONVERSIONS, PRODUCT_CATALOG_SALES, VIDEO_VIEWS

⚠️ **GOTCHA: Budgets are in micro-currency (1 USD = 1,000,000). $50/day → daily_budget_micro: 50000000**

## Step 2: Create Ad Squad (Ad Group)

⚠️ **GOTCHA: Ad groups in Snapchat are called "Ad Squads" (entity type "adGroup" maps to API path /adsquads)**
⚠️ **GOTCHA: Ad squad list path uses campaignId (/v1/campaigns/{id}/adsquads) but create path uses adAccountId**

\`\`\`json
snapchat_create_entity({
  "entityType": "adGroup",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "18-35 Female Audience",
    "campaign_id": "CAMPAIGN_ID_FROM_STEP_1",
    "status": "ACTIVE",
    "daily_budget_micro": 10000000,
    "bid_micro": 1000000,
    "optimization_goal": "SWIPE",
    "placement": "SNAP_ADS"
  }
})
\`\`\`

**Optimization Goals:** SWIPE, PIXEL_PAGE_VIEW, APP_INSTALL, VIDEO_VIEWS, STORY_OPENS
**Placement Options:** SNAP_ADS, AUDIENCE_NETWORK, BOTH

## Step 3: Create Creative

\`\`\`json
snapchat_create_entity({
  "entityType": "creative",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Spring 2024 Creative",
    "type": "SNAP_AD",
    "ad_account_id": "${adAccountId}",
    "brand_name": "Your Brand",
    "headline": "Your headline here",
    "call_to_action": "LEARN_MORE"
  }
})
\`\`\`

**Creative Types:** SNAP_AD, STORY, COLLECTION, APP_INSTALL, WEB_VIEW
**Call to Action:** INSTALL_NOW, SHOP_NOW, LEARN_MORE, SIGN_UP, WATCH_NOW

## Step 4: Create Ad

\`\`\`json
snapchat_create_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Spring Sale Ad",
    "ad_squad_id": "AD_SQUAD_ID_FROM_STEP_2",
    "creative_id": "CREATIVE_ID_FROM_STEP_3",
    "status": "ACTIVE",
    "type": "SNAP_AD"
  }
})
\`\`\`

## Step 5: Verify & Activate

1. Review: \`snapchat_get_entity\` for each created entity
2. Preview ad: \`snapchat_get_ad_preview\`
3. Activate campaign: \`snapchat_bulk_update_status\` with status: "ACTIVE"

## Common Gotchas

- ⚠️ Budgets are in micro-currency (1 USD = 1,000,000). $50/day → daily_budget_micro: 50000000
- ⚠️ Ad groups are called "Ad Squads" in Snapchat — entity type "adGroup" maps to /adsquads in the API
- ⚠️ Ad squad list path uses campaignId (/v1/campaigns/{id}/adsquads) but create path uses adAccountId
- ⚠️ Creative must be uploaded/created before creating an Ad (creative_id required)
- ⚠️ Reporting has a 24-48h lag for finalized data
`;
}
