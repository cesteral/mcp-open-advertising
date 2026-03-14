import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "msads_campaign_setup_workflow",
  description: "Step-by-step guide for creating a complete Microsoft Advertising campaign",
  arguments: [
    { name: "accountId", description: "Microsoft Ads Account ID", required: true },
    { name: "campaignType", description: "Campaign type (Search, Shopping, Audience)", required: false },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const accountId = args?.accountId || "{accountId}";
  const campaignType = args?.campaignType || "Search";

  return `# Microsoft Ads Campaign Setup Workflow

## Step 1: Create Budget (optional — for shared budgets)
\`\`\`json
msads_create_entity({
  "entityType": "budget",
  "data": {
    "Budgets": [{
      "Name": "Q1 2026 Budget",
      "Amount": 3000.00,
      "BudgetType": "MonthlyBudgetSpendUntilDepleted"
    }]
  }
})
\`\`\`

## Step 2: Create Campaign
\`\`\`json
msads_create_entity({
  "entityType": "campaign",
  "data": {
    "Campaigns": [{
      "Name": "My ${campaignType} Campaign",
      "BudgetType": "DailyBudgetStandard",
      "DailyBudget": 50.00,
      "TimeZone": "EasternTimeUSCanada",
      "CampaignType": "${campaignType}",
      "Languages": ["English"],
      "Status": "Paused"
    }]
  }
})
\`\`\`

## Step 3: Add Campaign Targeting
\`\`\`json
msads_manage_criterions({
  "operation": "add",
  "entityLevel": "campaign",
  "data": {
    "CampaignCriterions": [
      { "CampaignId": {campaignId}, "Type": "LocationCriterion", "LocationId": 190 }
    ]
  }
})
\`\`\`

## Step 4: Create Ad Group
\`\`\`json
msads_create_entity({
  "entityType": "adGroup",
  "data": {
    "AdGroups": [{
      "Name": "Brand Keywords",
      "CampaignId": {campaignId},
      "CpcBid": { "Amount": 1.50 },
      "Status": "Active"
    }]
  }
})
\`\`\`

## Step 5: Add Keywords
\`\`\`json
msads_create_entity({
  "entityType": "keyword",
  "data": {
    "Keywords": [
      { "AdGroupId": {adGroupId}, "Text": "buy shoes", "MatchType": "Phrase", "Bid": { "Amount": 2.00 } },
      { "AdGroupId": {adGroupId}, "Text": "shoes online", "MatchType": "Broad", "Bid": { "Amount": 1.50 } }
    ]
  }
})
\`\`\`

## Step 6: Create Responsive Search Ad
\`\`\`json
msads_create_entity({
  "entityType": "ad",
  "data": {
    "Ads": [{
      "AdGroupId": {adGroupId},
      "Type": "ResponsiveSearchAd",
      "Headlines": [
        { "Text": "Buy Shoes Online" },
        { "Text": "Free Shipping Today" },
        { "Text": "Great Deals on Shoes" }
      ],
      "Descriptions": [
        { "Text": "Wide selection of shoes at great prices. Shop now!" },
        { "Text": "Free returns on all orders. Order today!" }
      ],
      "FinalUrls": ["https://example.com/shoes"],
      "Path1": "shoes",
      "Path2": "sale"
    }]
  }
})
\`\`\`

## Step 7: Add Ad Extensions
\`\`\`json
msads_manage_ad_extensions({
  "operation": "associate",
  "data": {
    "AdExtensionIdToEntityIdAssociations": [
      { "AdExtensionId": {extensionId}, "EntityId": {campaignId} }
    ],
    "AssociationType": "Campaign"
  }
})
\`\`\`

## Step 8: Activate Campaign
\`\`\`json
msads_update_entity({
  "entityType": "campaign",
  "data": { "Campaigns": [{ "Id": {campaignId}, "Status": "Active" }] }
})
\`\`\`

## Success Checklist
- [ ] Budget created (if shared)
- [ ] Campaign created with correct type and settings
- [ ] Location and other targeting applied
- [ ] Ad group(s) created with appropriate bids
- [ ] Keywords added with match types
- [ ] Responsive search ad created
- [ ] Ad extensions associated
- [ ] Campaign activated
`;
}
