// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "pinterest_campaign_setup_workflow",
  description:
    "Step-by-step guide for creating a complete Pinterest Ads campaign structure (Campaign > Ad Group > Ad)",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest Ad Account ID (e.g., 549755885175)",
      required: true,
    },
    {
      name: "objective",
      description:
        "Campaign objective_type: AWARENESS, CONSIDERATION, WEB_CONVERSION, CATALOG_SALES, VIDEO_COMPLETION, SALES, APP_INSTALL or CTV_CONSIDERATION (default AWARENESS)",
      required: false,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const objective = args?.objective || "AWARENESS";

  return `# Pinterest Campaign Setup Workflow

## Prerequisites
- Ad Account ID: \`${adAccountId}\`
- Verify access: \`pinterest_list_ad_accounts\`
- A Pin to promote (see the \`creative_upload_workflow\` prompt)

Everything below is created **PAUSED** and activated in Step 4, after review. Field names and enums are Pinterest's own (OpenAPI v5); \`ad_account_id\` comes from \`adAccountId\`.

## Step 1: Create Campaign

\`\`\`json
pinterest_create_entity({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Campaign Name",
    "objective_type": "${objective}",
    "status": "PAUSED"
  }
})
\`\`\`

**Required:** \`name\`, \`objective_type\`.

**objective_type:** AWARENESS, CONSIDERATION, WEB_CONVERSION, CATALOG_SALES, VIDEO_COMPLETION, SALES, APP_INSTALL, CTV_CONSIDERATION

**Status values:** ACTIVE, PAUSED, ARCHIVED, DRAFT (ARCHIVED cannot be undone with these tools)

This example leaves budgets to the ad group. For campaign budget optimization, set \`is_campaign_budget_optimization: true\` and exactly one of \`daily_spend_cap\` / \`lifetime_spend_cap\` on the campaign instead.

## Step 2: Create Ad Group

\`\`\`json
pinterest_create_entity({
  "entityType": "adGroup",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Ad Group Name",
    "campaign_id": "CAMPAIGN_ID_FROM_STEP_1",
    "status": "PAUSED",
    "billable_event": "IMPRESSION",
    "budget_type": "DAILY",
    "budget_in_micro_currency": 10000000,
    "bid_in_micro_currency": 1500000,
    "pacing_delivery_type": "STANDARD",
    "start_time": 1775001600,
    "targeting_spec": {
      "AGE_BUCKET": ["35-44", "45-49"],
      "GENDER": ["female"],
      "LOCATION": ["US"],
      "INTEREST": ["{interestId}"]
    }
  }
})
\`\`\`

**Required:** \`name\`, \`campaign_id\`, \`billable_event\` (\`IMPRESSION\`, \`CLICKTHROUGH\` or \`VIDEO_V_50_MRC\`).

- \`budget_in_micro_currency\` is required unless the campaign uses budget optimization. \`budget_type\` is \`DAILY\` (default) or \`LIFETIME\`.
- \`bid_in_micro_currency\` is required for AWARENESS/IMPRESSION, CONSIDERATION/CLICKTHROUGH and CATALOG_SALES/CLICKTHROUGH. \`bid_strategy_type\` is \`AUTOMATIC_BID\`, \`MAX_BID\` or \`TARGET_AVG\`.
- \`optimization_goal_metadata\` is required when the campaign's objective is WEB_CONVERSION.
- Get interest ids and other \`targeting_spec\` values from \`pinterest_targeting_discovery_workflow\`.

## Step 3: Create Ad(s)

> ⚠️ **GOTCHA:** An ad promotes an existing Pin by \`pin_id\`. Create the Pin first.

\`\`\`json
pinterest_create_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Ad Name",
    "ad_group_id": "ADGROUP_ID_FROM_STEP_2",
    "creative_type": "REGULAR",
    "pin_id": "YOUR_PIN_ID",
    "status": "PAUSED"
  }
})
\`\`\`

**Required:** \`ad_group_id\`, \`creative_type\`, \`pin_id\`.

**Common creative types:** REGULAR (image), VIDEO, CAROUSEL, SHOPPING, COLLECTION, IDEA

## Step 4: Verify & Activate

1. Review each entity with \`pinterest_get_entity\`
2. Preview the ad with \`pinterest_get_ad_preview\`
3. Activate campaign, ad group and ad with \`pinterest_bulk_update_status\` and \`operationStatus: "ACTIVE"\`

## Common Gotchas

- ⚠️ **Money is integer micro-currency** (1.00 = 1,000,000): \`budget_in_micro_currency: 10000000\` = 10.00 a day.
- ⚠️ **Times are Unix seconds** (\`start_time\`, \`end_time\`), not ISO strings. \`1775001600\` = 2026-04-01 00:00 UTC.
- ⚠️ **targeting_spec keys are UPPERCASE** (\`AGE_BUCKET\`, \`GENDER\`, \`LOCATION\`, \`INTEREST\`), and ages are range strings like \`"35-44"\`.
- ⚠️ **Status values are ACTIVE / PAUSED / ARCHIVED / DRAFT**, not ENABLE/DISABLE.
- ⚠️ **Pinterest returns rejected items with HTTP 200** and per-item \`exceptions\`. The tools surface those as errors, so check the result.
- ⚠️ Reporting data can lag 24-48h before it is final.
`;
}
