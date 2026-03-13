import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "pinterest_campaign_setup_workflow",
  description: "Step-by-step guide for creating a complete Pinterest Ads campaign structure (Campaign > Ad Group > Ad)",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest Ad Account ID (e.g., 549755885175)",
      required: true,
    },
    {
      name: "objective",
      description: "Campaign objective (e.g., AWARENESS, CONSIDERATION, VIDEO_VIEW, CATALOG_SALES, CONVERSIONS, APP_INSTALL, SHOPPING)",
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
- Verify access: \`pinterest_list_advertisers\`

## Step 1: Create Campaign

\`\`\`json
pinterest_create_entity({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Campaign Name",
    "objective_type": "${objective}",
    "status": "ACTIVE",
    "daily_spend_cap": 50000000
  }
})
\`\`\`

**Campaign Objectives:** AWARENESS, CONSIDERATION, VIDEO_VIEW, CATALOG_SALES, CONVERSIONS, APP_INSTALL, SHOPPING

**Status values:** ACTIVE, PAUSED, ARCHIVED

## Step 2: Create Ad Group

\`\`\`json
pinterest_create_entity({
  "entityType": "adGroup",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Ad Group Name",
    "campaign_id": "CAMPAIGN_ID_FROM_STEP_1",
    "status": "ACTIVE",
    "budget_in_micro_currency": 10000000,
    "pacing_delivery_type": "STANDARD",
    "bid_strategy_type": "AUTOMATIC_BID",
    "start_time": "2026-04-01T00:00:00",
    "targeting_spec": {
      "age_bucket": ["35-44", "45-49"],
      "gender": ["female"],
      "geo": [{ "country": "US" }],
      "interest": ["food", "fashion"]
    }
  }
})
\`\`\`

## Step 3: Create Ad(s)

> ⚠️ **GOTCHA:** Ads reference Pinterest Pins by pin_id — create/upload the Pin first before creating the Ad.

\`\`\`json
pinterest_create_entity({
  "entityType": "ad",
  "adAccountId": "${adAccountId}",
  "data": {
    "name": "Your Ad Name",
    "ad_group_id": "ADGROUP_ID_FROM_STEP_2",
    "creative_type": "REGULAR",
    "pin_id": "YOUR_PIN_ID",
    "status": "ACTIVE"
  }
})
\`\`\`

**Creative types:** REGULAR, VIDEO, SHOPPING, CAROUSEL

## Step 4: Verify & Activate

1. Review: \`pinterest_get_entity\` for each created entity
2. Preview ad: \`pinterest_get_ad_preview\`
3. Activate: \`pinterest_bulk_update_status\` with status: "ACTIVE"

## Common Gotchas

- ⚠️ **GOTCHA: Pinterest budgets use micro-currency (1 USD = 1,000,000). $50/day → daily_spend_cap: 50000000**
- ⚠️ **GOTCHA: Ads reference Pinterest Pins by pin_id — create/upload the Pin first before creating the Ad**
- ⚠️ **GOTCHA: Status values are ACTIVE/PAUSED/ARCHIVED (not ENABLE/DISABLE)**
- ⚠️ Ad group budget (\`budget_in_micro_currency\`) must also be in micro-currency
- ⚠️ \`start_time\` and \`end_time\` use ISO 8601 datetime strings (e.g., "2026-04-01T00:00:00")
- ⚠️ Reporting has a 24-48h lag for finalized data
`;
}
