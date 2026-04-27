// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";

export const entityExampleAllResource: Resource = {
  uri: "msads://entity-examples",
  name: "Microsoft Ads Entity Examples (All)",
  description: "Example payloads for all Microsoft Ads entity types",
  mimeType: "text/markdown",
  getContent: () => `# Microsoft Ads Entity Examples

## Campaign
\`\`\`json
{
  "Campaigns": [{
    "Name": "Summer Sale 2026",
    "BudgetType": "DailyBudgetStandard",
    "DailyBudget": 50.00,
    "TimeZone": "EasternTimeUSCanada",
    "CampaignType": "Search",
    "Languages": ["English"],
    "Status": "Paused"
  }]
}
\`\`\`

## Ad Group
\`\`\`json
{
  "AdGroups": [{
    "Name": "Brand Keywords",
    "CampaignId": 123456789,
    "CpcBid": { "Amount": 1.50 },
    "Language": "English",
    "Status": "Active"
  }]
}
\`\`\`

## Keyword
\`\`\`json
{
  "Keywords": [{
    "AdGroupId": 987654321,
    "Text": "buy shoes online",
    "MatchType": "Phrase",
    "Bid": { "Amount": 2.00 },
    "Status": "Active"
  }]
}
\`\`\`

## Responsive Search Ad
\`\`\`json
{
  "Ads": [{
    "AdGroupId": 987654321,
    "Type": "ResponsiveSearchAd",
    "Headlines": [
      { "Text": "Buy Shoes Online", "PinnedField": "Headline1" },
      { "Text": "Free Shipping Available" },
      { "Text": "Summer Sale - 30% Off" }
    ],
    "Descriptions": [
      { "Text": "Shop our wide selection of shoes. Free returns on all orders." },
      { "Text": "Top brands at great prices. Order today!" }
    ],
    "FinalUrls": ["https://example.com/shoes"],
    "Path1": "shoes",
    "Path2": "sale"
  }]
}
\`\`\`

## Budget
\`\`\`json
{
  "Budgets": [{
    "Name": "Shared Monthly Budget",
    "Amount": 1000.00,
    "BudgetType": "MonthlyBudgetSpendUntilDepleted"
  }]
}
\`\`\`
`,
};

export const entityExampleResources: Resource[] = [];
