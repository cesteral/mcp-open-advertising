// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "meta_campaign_setup_workflow",
  description:
    "Step-by-step guide for creating a complete Meta Ads campaign structure (Campaign > Ad Set > Ad Creative > Ad)",
  arguments: [
    {
      name: "adAccountId",
      description: "Meta Ad Account ID (e.g., act_123456789)",
      required: true,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Meta Campaign Setup Workflow

## Prerequisites
- Ad Account ID: \`${adAccountId}\`
- Verify account access: \`meta_list_ad_accounts\`

## Step 1: Create Campaign

\`\`\`json
meta_create_entity({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Campaign Name",
    "objective": "OUTCOME_TRAFFIC",
    "status": "PAUSED",
    "special_ad_categories": [],
    "daily_budget": 5000
  }
})
\`\`\`

**Campaign Objectives:** OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_APP_PROMOTION

## Step 2: Create Ad Creative(s)

\`\`\`json
meta_create_entity({
  "entityType": "adCreative",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Creative Name",
    "object_story_spec": {
      "page_id": "YOUR_PAGE_ID",
      "link_data": {
        "link": "https://example.com",
        "message": "Your ad copy",
        "name": "Headline",
        "call_to_action": { "type": "LEARN_MORE" },
        "image_hash": "YOUR_IMAGE_HASH"
      }
    }
  }
})
\`\`\`

## Step 3: Create Ad Set(s)

\`\`\`json
meta_create_entity({
  "entityType": "adSet",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Ad Set Name",
    "campaign_id": "CAMPAIGN_ID_FROM_STEP_1",
    "optimization_goal": "LINK_CLICKS",
    "billing_event": "IMPRESSIONS",
    "daily_budget": 5000,
    "targeting": {
      "age_min": 25,
      "age_max": 55,
      "geo_locations": { "countries": ["US"] }
    },
    "status": "PAUSED"
  }
})
\`\`\`

## Step 4: Create Ad(s)

\`\`\`json
meta_create_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Ad Name",
    "adset_id": "ADSET_ID_FROM_STEP_3",
    "creative": { "creative_id": "CREATIVE_ID_FROM_STEP_2" },
    "status": "PAUSED"
  }
})
\`\`\`

## Step 5: Verify & Activate

1. Review: \`meta_get_entity\` for each created entity
2. Preview: \`meta_get_ad_preview\` to see ad appearance
3. Activate: \`meta_bulk_update_status\` to set ACTIVE

## Common Gotchas

- Budget values are in **cents** (5000 = $50)
- Campaigns require \`special_ad_categories\` (use [] if none)
- targeting field **replaces entirely** on updates
- Data reporting lags up to 48 hours
`;
}
