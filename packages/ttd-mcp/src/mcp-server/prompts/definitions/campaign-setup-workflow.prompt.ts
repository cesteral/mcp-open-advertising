// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
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
    "PacingMode": "PaceAhead"
  }
}
\`\`\`

**Save**: Note the returned \`CampaignId\` — you'll need it for ad groups.

> Fetch \`entity-examples://campaign\` for more campaign creation patterns.

### Common Gotchas
- \`StartDate\` must be in the future
- \`Budget.Amount\` is **lifetime** budget, not daily
- \`PacingMode\` defaults to \`Off\` if omitted — usually you want \`PaceAhead\`

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
        "PacingMode": "PaceAhead"
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

## Step 4: Create Creative(s) (if needed)

Creatives must exist before ads can reference them.

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "creative",
  "advertiserId": "${advertiserId}",
  "data": {
    "CreativeName": "Banner 300x250 - Version A",
    "AdvertiserId": "${advertiserId}",
    "CreativeType": "Banner",
    "Width": 300,
    "Height": 250,
    "Tag": "<script src='https://cdn.example.com/ad.js'></script>",
    "LandingPageUrl": "https://www.example.com/landing",
    "IsHTTPS": true
  }
}
\`\`\`

**Save**: Note the returned \`CreativeId\`.

> Fetch \`entity-schema://creative\` for full field reference (Banner, Video, Native types).

---

## Step 5: Attach Creatives to the Ad Group

TTD has no standalone \`ad\` entity — an "ad" is an ad group plus the creatives in its \`RTBAttributes.CreativeIds\`.

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "adGroup",
  "entityId": "{AdGroupId from Step 3}",
  "advertiserId": "${advertiserId}",
  "campaignId": "{CampaignId from Step 2}",
  "data": {
    "RTBAttributes": {
      "CreativeIds": ["{CreativeId from Step 4}"]
    }
  }
}
\`\`\`

### Common Gotchas
- \`CreativeIds\` must reference **existing** creatives (created in Step 4)
- The array **replaces** the ad group's current creatives — include any existing IDs you want to keep
- Several creatives on one ad group let TTD rotate and optimize between them
- TTD's \`creativeAdGroupAssociate\` GraphQL mutation (via \`ttd_graphql_query\`) associates a creative without rewriting the ad group's \`RTBAttributes\`

---

## Step 6: Optional — Set Up Ancillary Entities

### Conversion Tracking (for CPA/ROAS campaigns)
\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "conversionTracker",
  "advertiserId": "${advertiserId}",
  "data": {
    "TrackingTagName": "Purchase - Thank You Page",
    "AdvertiserId": "${advertiserId}",
    "TrackingTagType": "Standard",
    "TrackingTagCategory": "Purchase",
    "ConversionType": "Both"
  }
}
\`\`\`

### Site Lists (for inventory targeting)
No tool here creates site lists, and \`ttd_create_entity\` does not accept \`siteList\`. Use an existing \`SiteListId\` (ask the user) in the ad group's \`RTBAttributes\`.

### Bid Lists (for dimensional bid adjustments)
Bid lists are not a \`ttd_create_entity\` type. Create one with \`ttd_manage_bid_list\`, which calls TTD's GraphQL \`bidListCreate\`. \`data\` is a \`BidListCreateInput\` object, not the retired REST shape (\`BidListName\`, \`BidListEntries\`). This server does not document that input's fields; take them from TTD's GraphQL schema documentation. Preview it first:
\`\`\`
Tool: ttd_manage_bid_list
Input: {
  "operation": "create",
  "data": { /* BidListCreateInput for advertiser ${advertiserId} */ },
  "dry_run": true
}
\`\`\`

---

## Step 7: Verify the Hierarchy

Confirm everything was created correctly:

1. List campaigns: \`ttd_list_entities\` with \`{ "entityType": "campaign", "advertiserId": "${advertiserId}" }\`
2. List ad groups: \`ttd_list_entities\` with \`{ "entityType": "adGroup", "campaignId": "{CampaignId}" }\`
3. Check creatives on an ad group: \`ttd_get_entity\` with \`{ "entityType": "adGroup", "entityId": "{AdGroupId}" }\` and read \`RTBAttributes.CreativeIds\`

---

## Success Checklist

- [ ] Advertiser verified with correct currency
- [ ] Campaign created with budget and flight dates
- [ ] Ad group created with bidding, targeting, and channel settings
- [ ] Creative(s) created (Banner, Video, or Native)
- [ ] Ad(s) created with creative associations
- [ ] (Optional) Conversion tracker deployed for CPA/ROAS
- [ ] (Optional) Site lists configured for inventory targeting
- [ ] (Optional) Bid lists configured for dimensional optimization
- [ ] Hierarchy verified via list queries

## Related Resources
- \`entity-hierarchy://all\` — Entity relationships and parent ID requirements (9 entity types)
- \`entity-schema://{entityType}\` — Full field reference per entity type
- \`entity-examples://{entityType}\` — CRUD payload examples

## Bulk Alternative
For creating multiple campaigns or ad groups at once, use:
- \`ttd_bulk_create_entities\` — batch create up to 50 items
- \`ttd_bulk_update_status\` — batch pause/resume after verification
`;
}
