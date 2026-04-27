// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "tiktok_campaign_setup_workflow",
  description:
    "Step-by-step guide for creating a complete TikTok Ads campaign structure (Campaign > Ad Group > Ad)",
  arguments: [
    {
      name: "advertiserId",
      description: "TikTok Advertiser ID (e.g., 1234567890)",
      required: true,
    },
    {
      name: "objective",
      description: "Campaign objective (e.g., TRAFFIC, APP_PROMOTION, WEB_CONVERSIONS)",
      required: false,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const objective = args?.objective || "TRAFFIC";

  return `# TikTok Campaign Setup Workflow

## Prerequisites
- Advertiser ID: \`${advertiserId}\`
- Verify access: \`tiktok_list_advertisers\`

## Step 1: Create Campaign

\`\`\`json
tiktok_create_entity({
  "entityType": "campaign",
  "advertiserId": "${advertiserId}",
  "data": {
    "campaign_name": "Your Campaign Name",
    "objective_type": "${objective}",
    "budget_mode": "BUDGET_MODE_DAY",
    "budget": 100
  }
})
\`\`\`

**Campaign Objectives:** TRAFFIC, APP_PROMOTION, WEB_CONVERSIONS, ENGAGEMENT, VIDEO_VIEWS, LEAD_GENERATION, PRODUCT_SALES

## Step 2: Create Ad Group

\`\`\`json
tiktok_create_entity({
  "entityType": "adGroup",
  "advertiserId": "${advertiserId}",
  "data": {
    "campaign_id": "CAMPAIGN_ID_FROM_STEP_1",
    "adgroup_name": "Your Ad Group Name",
    "placements": ["PLACEMENT_TIKTOK"],
    "budget_mode": "BUDGET_MODE_DAY",
    "budget": 50,
    "schedule_type": "SCHEDULE_START_END",
    "pacing": "PACING_MODE_SMOOTH",
    "schedule_start_time": "2026-03-01 00:00:00",
    "schedule_end_time": "2026-12-31 23:59:59",
    "optimization_goal": "CLICK",
    "bid_price": 0.5,
    "age": ["AGE_18_24", "AGE_25_34"],
    "gender": ["GENDER_UNLIMITED"],
    "location_ids": ["US"]
  }
})
\`\`\`

## Step 3: Create Ad(s)

\`\`\`json
tiktok_create_entity({
  "entityType": "ad",
  "advertiserId": "${advertiserId}",
  "data": {
    "adgroup_id": "ADGROUP_ID_FROM_STEP_2",
    "creatives": [
      {
        "ad_name": "Your Ad Name",
        "video_id": "YOUR_VIDEO_ID",
        "call_to_action": "LEARN_MORE",
        "landing_page_url": "https://example.com"
      }
    ]
  }
})
\`\`\`

## Step 4: Verify & Activate

1. Review: \`tiktok_get_entity\` for each created entity
2. Preview ad: \`tiktok_get_ad_preview\`
3. Activate: \`tiktok_bulk_update_status\` with operationStatus: "ENABLE"

## Common Gotchas

- ⚠️ Campaigns are created in **ENABLE** status by default — use DISABLE if not ready
- ⚠️ Ad groups require \`schedule_start_time\` when \`schedule_type\` is SCHEDULE_START_END
- ⚠️ Video IDs must be uploaded to TikTok Creative Library first
- ⚠️ Budget values are in account currency (NOT cents)
- ⚠️ All status updates use separate /status/update/ endpoints — use \`tiktok_bulk_update_status\`
- ⚠️ Reporting has a 24-48h lag for finalized data
`;
}
