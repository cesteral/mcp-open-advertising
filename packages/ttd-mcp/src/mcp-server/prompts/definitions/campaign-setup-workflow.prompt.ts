/**
 * TTD Campaign Setup Workflow Prompt
 *
 * Step-by-step guide for creating a complete campaign hierarchy:
 * Advertiser → Campaign → Ad Group → Ad
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "ttd_campaign_setup_workflow",
  description:
    "Step-by-step workflow for creating a complete TTD campaign hierarchy (Advertiser → Campaign → Ad Group → Ad)",
  arguments: [
    {
      name: "advertiserId",
      description: "TTD Advertiser ID to create the campaign under",
      required: true,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(
  args?: Record<string, string>
): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";

  return `# TTD Campaign Setup Workflow

## Context
- Advertiser ID: \`${advertiserId}\`
- Platform: The Trade Desk (TTD API v3)

This workflow guides you through creating a full campaign hierarchy. Each step depends on the previous one.

---

## Step 1: Verify the Advertiser

Before creating anything, confirm the advertiser exists and note its currency.

\`\`\`
Tool: ttd_get_entity
Input: { "entityType": "advertiser", "entityId": "${advertiserId}" }
\`\`\`

**Check**: Note the \`CurrencyCode\` — all budgets must use this currency.

> Fetch \`entity-schema://advertiser\` for full field reference.

---

## Step 2: Create the Campaign

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "campaign",
  "advertiserId": "${advertiserId}",
  "data": {
    "CampaignName": "Your Campaign Name",
    "AdvertiserId": "${advertiserId}",
    "Budget": { "Amount": 50000, "CurrencyCode": "USD" },
    "StartDate": "2025-03-01T00:00:00",
    "EndDate": "2025-03-31T23:59:59",
    "PacingMode": "PaceEvenly"
  }
}
\`\`\`

**Save**: Note the returned \`CampaignId\` — you'll need it for ad groups.

> Fetch \`entity-examples://campaign\` for more campaign creation patterns.

### Common Gotchas
- \`StartDate\` must be in the future
- \`Budget.Amount\` is **lifetime** budget, not daily
- \`PacingMode\` defaults to \`Off\` if omitted — usually you want \`PaceEvenly\`

---

## Step 3: Create Ad Group(s)

Ad groups contain targeting and bidding configuration.

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "adGroup",
  "advertiserId": "${advertiserId}",
  "data": {
    "AdGroupName": "Your Ad Group Name",
    "CampaignId": "{CampaignId from Step 2}",
    "AdvertiserId": "${advertiserId}",
    "RTBAttributes": {
      "BudgetSettings": {
        "Budget": { "Amount": 10000, "CurrencyCode": "USD" },
        "DailyBudget": { "Amount": 500, "CurrencyCode": "USD" },
        "PacingMode": "PaceEvenly"
      },
      "BaseBidCPM": { "Amount": 5.00, "CurrencyCode": "USD" },
      "MaxBidCPM": { "Amount": 12.00, "CurrencyCode": "USD" }
    }
  }
}
\`\`\`

**Save**: Note the returned \`AdGroupId\`.

> Fetch \`entity-schema://adGroup\` for targeting options (geo, audience, site).

### Common Gotchas
- \`RTBAttributes\` is **required** — must include \`BudgetSettings\` and \`BaseBidCPM\`
- Ad group budget cannot exceed parent campaign budget
- Targeting (geo, audience, device) is set at the ad group level, not the ad level

---

## Step 4: Create Ad(s)

Ads associate creatives with the ad group.

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "ad",
  "advertiserId": "${advertiserId}",
  "data": {
    "AdName": "Your Ad Name",
    "AdGroupId": "{AdGroupId from Step 3}",
    "AdvertiserId": "${advertiserId}",
    "CreativeIds": ["{existing creative ID}"],
    "LandingPageUrl": "https://www.example.com/landing"
  }
}
\`\`\`

### Common Gotchas
- \`CreativeIds\` must reference **existing** creatives (create them separately first)
- Multiple creatives in one ad enables TTD auto-optimization (A/B testing)
- Ads inherit targeting from their parent ad group

---

## Step 5: Verify the Hierarchy

Confirm everything was created correctly:

1. List campaigns: \`ttd_list_entities\` with \`{ "entityType": "campaign", "filters": { "AdvertiserIds": ["${advertiserId}"] } }\`
2. List ad groups: \`ttd_list_entities\` with \`{ "entityType": "adGroup", "filters": { "CampaignId": "{CampaignId}" } }\`
3. List ads: \`ttd_list_entities\` with \`{ "entityType": "ad", "filters": { "AdGroupId": "{AdGroupId}" } }\`

---

## Success Checklist

- [ ] Advertiser verified with correct currency
- [ ] Campaign created with budget and flight dates
- [ ] Ad group created with bidding and optional targeting
- [ ] Ad(s) created with creative associations
- [ ] Hierarchy verified via list queries

## Related Resources
- \`entity-hierarchy://all\` — Entity relationships and parent ID requirements
- \`entity-schema://{entityType}\` — Full field reference per entity type
- \`entity-examples://{entityType}\` — CRUD payload examples
`;
}
