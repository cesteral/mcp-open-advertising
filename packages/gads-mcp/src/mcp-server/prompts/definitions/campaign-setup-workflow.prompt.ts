// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads Campaign Setup Workflow Prompt
 *
 * Step-by-step guide for creating a complete campaign hierarchy:
 * Budget → Campaign → Ad Group → Ads → Keywords
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "gads_campaign_setup_workflow",
  description:
    "Step-by-step workflow for creating a complete Google Ads Search campaign (Budget → Campaign → Ad Group → Ads → Keywords)",
  arguments: [
    {
      name: "customerId",
      description: "Google Ads customer ID (no dashes)",
      required: true,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const customerId = args?.customerId || "{customerId}";

  return `# Google Ads Campaign Setup Workflow

## Context
- Customer ID: \`${customerId}\`
- Platform: Google Ads API v23
- Campaign Type: Search (most common)

This workflow guides you through creating a full campaign hierarchy. Each step depends on the previous one.

---

## Step 1: Verify the Account

Confirm the account exists and is accessible.

\`\`\`
Tool: gads_list_accounts
Input: {}
\`\`\`

**Check**: Confirm \`${customerId}\` appears in the list.

---

## Step 2: Create a Campaign Budget

⚠️ **GOTCHA**: Google Ads requires a separate CampaignBudget entity. Create it before the campaign.

\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "campaignBudget",
  "customerId": "${customerId}",
  "data": {
    "name": "My Campaign Budget",
    "amountMicros": "50000000",
    "deliveryMethod": "STANDARD"
  }
}
\`\`\`

**Save**: Note the returned resource name (e.g., \`customers/${customerId}/campaignBudgets/{budgetId}\`).

> \`amountMicros\` is the **daily** budget in micros. $50/day = "50000000".

---

## Step 3: Create the Campaign

\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "campaign",
  "customerId": "${customerId}",
  "data": {
    "name": "My Search Campaign",
    "advertisingChannelType": "SEARCH",
    "status": "PAUSED",
    "campaignBudget": "customers/${customerId}/campaignBudgets/{budgetId}",
    "startDate": "2025-03-01",
    "networkSettings": {
      "targetGoogleSearch": true,
      "targetSearchNetwork": true,
      "targetContentNetwork": false,
      "targetPartnerSearchNetwork": false
    },
    "manualCpc": {
      "enhancedCpcEnabled": false
    }
  }
}
\`\`\`

**Save**: Note the returned resource name (e.g., \`customers/${customerId}/campaigns/{campaignId}\`).

### Common Gotchas
- Set \`status: "PAUSED"\` initially — enable after full setup is verified
- \`campaignBudget\` must be the full resource name from Step 2
- \`advertisingChannelType\` cannot be changed after creation
- Choose bidding strategy carefully: \`manualCpc\` for control, \`maximizeConversions\` for automation

---

## Step 4: Create Ad Group(s)

\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "adGroup",
  "customerId": "${customerId}",
  "data": {
    "name": "My Ad Group",
    "campaign": "customers/${customerId}/campaigns/{campaignId}",
    "status": "ENABLED",
    "type": "SEARCH_STANDARD",
    "cpcBidMicros": "2500000"
  }
}
\`\`\`

**Save**: Note the returned resource name.

> \`cpcBidMicros\` is the default max CPC bid. $2.50 = "2500000".

---

## Step 5: Add Keywords

\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "keyword",
  "customerId": "${customerId}",
  "data": {
    "adGroup": "customers/${customerId}/adGroups/{adGroupId}",
    "status": "ENABLED",
    "keyword": {
      "text": "running shoes",
      "matchType": "PHRASE"
    },
    "cpcBidMicros": "3000000"
  }
}
\`\`\`

### Keyword Strategy Tips
- Start with 10-20 keywords per ad group
- Use a mix of match types (Broad for reach, Phrase/Exact for precision)
- Add negative keywords to exclude irrelevant searches
- Group related keywords together in the same ad group

---

## Step 6: Create Responsive Search Ads

\`\`\`
Tool: gads_create_entity
Input: {
  "entityType": "ad",
  "customerId": "${customerId}",
  "data": {
    "adGroup": "customers/${customerId}/adGroups/{adGroupId}",
    "status": "ENABLED",
    "ad": {
      "responsiveSearchAd": {
        "headlines": [
          { "text": "Buy Running Shoes" },
          { "text": "Free Shipping Available" },
          { "text": "Shop Top Brands Today" }
        ],
        "descriptions": [
          { "text": "Wide selection of running shoes. Free returns on all orders." },
          { "text": "Top brands at great prices. Order today and get free shipping." }
        ],
        "path1": "shoes",
        "path2": "running"
      },
      "finalUrls": ["https://www.example.com/running-shoes"]
    }
  }
}
\`\`\`

### Ad Copy Tips
- Provide 8-15 headlines and 3-4 descriptions for best performance
- Headlines: max 30 characters each
- Descriptions: max 90 characters each
- Include keywords in headlines and descriptions
- Google auto-tests combinations and optimizes

---

## Step 7: Enable the Campaign

After verifying all components are set up correctly:

\`\`\`
Tool: gads_update_entity
Input: {
  "entityType": "campaign",
  "customerId": "${customerId}",
  "entityId": "{campaignId}",
  "data": {
    "status": "ENABLED"
  },
  "updateMask": "status"
}
\`\`\`

---

## Step 8: Verify the Hierarchy

Confirm everything was created correctly:

1. List campaigns: \`gads_list_entities\` with \`{ "entityType": "campaign", "customerId": "${customerId}" }\`
2. List ad groups: \`gads_list_entities\` with \`{ "entityType": "adGroup", "customerId": "${customerId}", "filters": { "ad_group.campaign": "= 'customers/${customerId}/campaigns/{campaignId}'" } }\`
3. Check performance after 24h: \`gads_gaql_search\` with campaign performance GAQL query

---

## Success Checklist

- [ ] Account verified and accessible
- [ ] Campaign budget created with daily amount
- [ ] Campaign created (initially PAUSED) with budget linked
- [ ] Ad group(s) created with appropriate CPC bids
- [ ] Keywords added with proper match types
- [ ] Responsive Search Ads created with multiple headlines/descriptions
- [ ] Campaign enabled after verification
- [ ] Hierarchy verified via list queries

## Related Resources
- \`entity-hierarchy://gads\` — Entity relationships and API patterns
- \`entity-schema://{entityType}\` — Full field reference per entity type
- \`gaql-reference://syntax\` — GAQL query syntax and common patterns

## Bulk Alternative
For creating multiple entities at once, use:
- \`gads_bulk_mutate\` — batch create/update/remove in single API call
- \`gads_bulk_update_status\` — batch enable/pause after verification
`;
}
