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
      description:
        "Campaign objective type: AWARENESS_AND_ENGAGEMENT, APP_PROMOTION, TRAFFIC, or SALES (sent as objective_v2_properties.objective_v2_type)",
      required: false,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const objective = args?.objective || "AWARENESS_AND_ENGAGEMENT";

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
    "objective_v2_properties": { "objective_v2_type": "${objective}" },
    "status": "PAUSED",
    "ad_account_id": "${adAccountId}",
    "start_time": "2026-01-01T00:00:00Z",
    "daily_budget_micro": 50000000
  }
})
\`\`\`

**Campaign Objective Types** (\`objective_v2_properties.objective_v2_type\`): AWARENESS_AND_ENGAGEMENT, APP_PROMOTION, TRAFFIC, SALES. For APP_PROMOTION add \`"promotion_type": "APP_INSTALL"\`.

⚠️ **GOTCHA: Do not send the legacy \`objective\` attribute.** Snap auto-translates it (from 2025-03-21) but \`objective_v2_properties\` is the documented field.

⚠️ **GOTCHA: Budgets are in micro-currency (1 USD = 1,000,000). $50/day → daily_budget_micro: 50000000**

## Step 2: Create Ad Squad (Ad Group)

⚠️ **GOTCHA: Ad groups in Snapchat are called "Ad Squads" (entity type "adGroup" maps to API path /adsquads)**
⚠️ **GOTCHA: Ad squad list and create routes both use the parent campaign (/v1/campaigns/{campaignId}/adsquads) — pass \`campaignId\` (or \`campaign_id\` in \`data\`); \`adAccountId\` is still required for account scoping**

\`\`\`json
snapchat_create_entity({
  "entityType": "adGroup",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "18-35 Female Audience",
    "campaign_id": "CAMPAIGN_ID_FROM_STEP_1",
    "status": "ACTIVE",
    "type": "SNAP_ADS",
    "placement_v2": { "config": "AUTOMATIC", "platforms": ["SNAPCHAT"] },
    "billing_event": "IMPRESSION",
    "bid_strategy": "LOWEST_COST_WITH_MAX_BID",
    "daily_budget_micro": 10000000,
    "bid_micro": 1000000,
    "optimization_goal": "SWIPES",
    "targeting": { "geos": [{ "country_code": "us" }] }
  }
})
\`\`\`

**Optimization Goals:** IMPRESSIONS, SWIPES, APP_INSTALLS, VIDEO_VIEWS, PIXEL_PURCHASE (see the \`snapchat_validate_entity\` tool and \`entity-schema://snapchat/adGroup\` for more)
**Bid Strategies:** AUTO_BID, LOWEST_COST_WITH_MAX_BID, TARGET_COST (\`bid_micro\` is required for the last two)
**Placement (\`placement_v2\`, required):** \`config\` is AUTOMATIC or CUSTOM; \`snapchat_positions\` (INTERSTITIAL_USER, INTERSTITIAL_CONTENT, INTERSTITIAL_SPOTLIGHT, INSTREAM, PUBLIC_STORIES_INSTREAM, CHAT_FEED, FEED, CAMERA, POST_CAPTURE_CAROUSEL) only with CUSTOM.

⚠️ **GOTCHA: The legacy \`placement\` attribute (SNAP_ADS / AUDIENCE_NETWORK / BOTH) is rejected** — every ad squad must use \`placement_v2\`.

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
- ⚠️ Ad squad list and create routes both use campaignId (/v1/campaigns/{id}/adsquads)
- ⚠️ Creative must be uploaded/created before creating an Ad (creative_id required)
- ⚠️ Reporting has a 24-48h lag for finalized data
`;
}
