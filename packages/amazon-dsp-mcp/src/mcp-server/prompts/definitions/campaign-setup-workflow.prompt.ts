// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "amazon_dsp_campaign_setup_workflow",
  description:
    "Step-by-step guide for creating a complete Amazon DSP campaign structure on the Unified API (Order > Line Item > Target / Creative Association > Creative)",
  arguments: [
    {
      name: "profileId",
      description: "Amazon Ads profile ID bound to the session (Amazon-Advertising-API-Scope)",
      required: true,
    },
    {
      name: "accountId",
      description:
        "DSP advertiser ID (advertiserId from amazon_dsp_list_advertisers) — sent as Amazon-Ads-AccountId",
      required: false,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const profileId = args?.profileId || "{profileId}";
  const accountId = args?.accountId || "{accountId}";

  return `# Amazon DSP Campaign Setup Workflow (Unified API)

Entity management uses the Amazon Ads Unified API (\`POST /adsApi/v1/{create|update|query|delete}/…\`).

## Prerequisites
- Profile ID (session): \`${profileId}\`
- DSP advertiser ID: \`${accountId}\` — find it with \`amazon_dsp_list_advertisers\` and pass it as \`accountId\` on every entity tool (it becomes the \`Amazon-Ads-AccountId\` header)

⚠️ **GOTCHA: Orders and line items can only be created PAUSED.** Enable them at the end.
⚠️ **GOTCHA: Budget amounts are advertiser-currency major units** (e.g. 50000 = 50,000.00), not micros.
⚠️ **GOTCHA: There is no advertiserId body field** — the advertiser is \`accountId\`.
⚠️ **GOTCHA: ARCHIVED is not an update state.** Orders and line items are removed with \`amazon_dsp_delete_entity\` (a legacy archive call); targets and creative associations are deleted.

## Step 1: Create the Order (Unified campaign)

Dates and budget live on \`flights[]\`.

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "order",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "data": {
    "name": "Q1 Brand Awareness Campaign",
    "countries": ["US"],
    "flights": [
      {
        "startDateTime": "2026-01-01T00:00:00Z",
        "endDateTime": "2026-03-31T23:59:59Z",
        "budget": {
          "budgetType": "MONETARY",
          "budgetValue": { "monetaryBudgetValue": { "monetaryBudget": { "value": 50000 } } }
        }
      }
    ],
    "optimizations": {
      "bidSettings": { "bidStrategy": "SPEND_BUDGET_IN_FULL" },
      "goalSettings": { "kpi": "CLICK_THROUGH_RATE" }
    }
  }
})
\`\`\`

The response \`entity.campaignId\` is the order ID.

## Step 2: Create a Line Item (Unified ad group)

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "lineItem",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "data": {
    "name": "Prospecting - Display",
    "campaignId": "CAMPAIGN_ID_FROM_STEP_1",
    "inventoryType": "DISPLAY",
    "advertisedProductCategoryIds": ["12345"],
    "bid": { "baseBid": 2.5 },
    "creativeRotationType": "RANDOM",
    "startDateTime": "2026-01-01T00:00:00Z",
    "endDateTime": "2026-03-31T23:59:59Z",
    "optimization": { "bidStrategy": "SPEND_BUDGET_IN_FULL" },
    "pacing": { "deliveryProfile": "EVEN" },
    "targetingSettings": { "timeZoneType": "VIEWER", "userLocationSignal": "ANYWHERE" }
  }
})
\`\`\`

The response \`entity.adGroupId\` is the line item ID.

## Step 3: Add Targets

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "target",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "data": {
    "adGroupId": "AD_GROUP_ID_FROM_STEP_2",
    "negative": false,
    "state": "ENABLED",
    "targetType": "AUDIENCE",
    "targetDetails": { "audienceTarget": { "audienceId": { "defaultValue": "AUDIENCE_ID" }, "groupId": "1" } }
  }
})
\`\`\`

## Step 4: Create a Creative (Unified ad) and associate it

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "creative",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "data": {
    "name": "Responsive Ecommerce Ad",
    "adType": "COMPONENT",
    "state": "ENABLED",
    "creative": { "componentCreative": { "responsiveEcommerceSettings": { "language": "EN", "inventoryTypes": ["DISPLAY"], "products": [{ "productId": "B0EXAMPLE", "productIdType": "ASIN" }] } } }
  }
})
\`\`\`

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "creativeAssociation",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "data": { "adGroupId": "AD_GROUP_ID_FROM_STEP_2", "adId": "AD_ID_FROM_STEP_4", "state": "ENABLED" }
})
\`\`\`

**Ad types:** AUDIO, COMPONENT, DISPLAY, THIRD_PARTY, VIDEO — each with one matching \`creative\` key (\`audioCreative\`, \`componentCreative\`, …). See \`entity-schema://amazonDsp/creative\`.

## Step 5: Verify & Activate

1. Review: \`amazon_dsp_get_entity\` for the order and line item
2. Activate: \`amazon_dsp_bulk_update_status\` with \`operationStatus: "ENABLED"\` — line items first, then the order

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Missing or invalid access token | Re-authorize via Login with Amazon |
| 403 Forbidden | Wrong \`accountId\` or missing permission | Check the advertiser with \`amazon_dsp_list_advertisers\` |
| 207 with \`error[]\` | Amazon rejected the item | The tool error lists Amazon's \`code\` and \`fieldLocation\` |
| INVALID_STATE (client-side) | Order / line item created with a state other than PAUSED | Omit \`state\` on create |

## Success Criteria

- [ ] Order created with flights covering the date range
- [ ] Line item linked to the order via \`campaignId\`
- [ ] Targets and a creative association on the line item
- [ ] Line items and order ENABLED
`;
}
