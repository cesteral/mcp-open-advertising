// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads Entity Example Resources
 *
 * CRUD example payloads for each Google Ads entity type.
 * 7 resources: 6 individual entity types + 1 aggregate.
 */
import type { Resource } from "../types.js";

const cachedExamples = new Map<string, string>();

// ─── Example content per entity type ───

function campaignExamplesMarkdown(): string {
  return `# Google Ads Campaign Examples

## Create Search Campaign

\`\`\`json
{
  "entityType": "campaign",
  "customerId": "1234567890",
  "data": {
    "name": "Q1 2025 Brand Search",
    "advertisingChannelType": "SEARCH",
    "status": "PAUSED",
    "campaignBudget": "customers/1234567890/campaignBudgets/111222333",
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
> \`campaignBudget\` must reference an existing CampaignBudget resource name.
> Set \`status: "PAUSED"\` initially, enable after full setup.

## Create Display Campaign

\`\`\`json
{
  "entityType": "campaign",
  "customerId": "1234567890",
  "data": {
    "name": "Q1 Display Remarketing",
    "advertisingChannelType": "DISPLAY",
    "status": "PAUSED",
    "campaignBudget": "customers/1234567890/campaignBudgets/111222333",
    "startDate": "2025-03-01",
    "targetCpa": {
      "targetCpaMicros": "5000000"
    }
  }
}
\`\`\`

## Get Campaign

\`\`\`json
{
  "entityType": "campaign",
  "customerId": "1234567890",
  "entityId": "444555666"
}
\`\`\`

## List Campaigns

\`\`\`json
{
  "entityType": "campaign",
  "customerId": "1234567890"
}
\`\`\`

## Update Campaign (Pause)

\`\`\`json
{
  "entityType": "campaign",
  "customerId": "1234567890",
  "entityId": "444555666",
  "data": {
    "status": "PAUSED"
  },
  "updateMask": "status"
}
\`\`\`
> \`updateMask\` is required — only listed fields are updated.

## Remove Campaign

\`\`\`json
{
  "entityType": "campaign",
  "customerId": "1234567890",
  "entityId": "444555666"
}
\`\`\`
> Removal sets status to REMOVED. This cannot be undone.
`;
}

function adGroupExamplesMarkdown(): string {
  return `# Google Ads Ad Group Examples

## Create Ad Group

\`\`\`json
{
  "entityType": "adGroup",
  "customerId": "1234567890",
  "data": {
    "name": "Running Shoes - Exact Match",
    "campaign": "customers/1234567890/campaigns/444555666",
    "status": "ENABLED",
    "type": "SEARCH_STANDARD",
    "cpcBidMicros": "2500000"
  }
}
\`\`\`
> \`cpcBidMicros\` is the default max CPC bid in micros. $2.50 = "2500000".
> \`campaign\` must be the full resource name.

## Create Display Ad Group

\`\`\`json
{
  "entityType": "adGroup",
  "customerId": "1234567890",
  "data": {
    "name": "Remarketing - All Visitors",
    "campaign": "customers/1234567890/campaigns/444555666",
    "status": "ENABLED",
    "type": "DISPLAY_STANDARD",
    "cpmBidMicros": "3000000"
  }
}
\`\`\`

## Get Ad Group

\`\`\`json
{
  "entityType": "adGroup",
  "customerId": "1234567890",
  "entityId": "777888999"
}
\`\`\`

## List Ad Groups for Campaign

\`\`\`json
{
  "entityType": "adGroup",
  "customerId": "1234567890",
  "filters": {
    "ad_group.campaign": "= 'customers/1234567890/campaigns/444555666'"
  }
}
\`\`\`

## Update Ad Group (Adjust Bid)

\`\`\`json
{
  "entityType": "adGroup",
  "customerId": "1234567890",
  "entityId": "777888999",
  "data": {
    "cpcBidMicros": "3500000"
  },
  "updateMask": "cpcBidMicros"
}
\`\`\`

## Update Ad Group (Pause)

\`\`\`json
{
  "entityType": "adGroup",
  "customerId": "1234567890",
  "entityId": "777888999",
  "data": {
    "status": "PAUSED"
  },
  "updateMask": "status"
}
\`\`\`
`;
}

function adExamplesMarkdown(): string {
  return `# Google Ads Ad Examples

## Create Responsive Search Ad

\`\`\`json
{
  "entityType": "ad",
  "customerId": "1234567890",
  "data": {
    "adGroup": "customers/1234567890/adGroups/777888999",
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
> Provide 8-15 headlines (max 30 chars) and 3-4 descriptions (max 90 chars) for best performance.
> Google auto-tests headline/description combinations.

## Create Responsive Display Ad

\`\`\`json
{
  "entityType": "ad",
  "customerId": "1234567890",
  "data": {
    "adGroup": "customers/1234567890/adGroups/777888999",
    "status": "ENABLED",
    "ad": {
      "responsiveDisplayAd": {
        "headlines": [{ "text": "Summer Sale" }],
        "longHeadline": { "text": "Huge Summer Sale - Up to 50% Off" },
        "descriptions": [{ "text": "Don't miss our biggest sale of the year." }],
        "businessName": "Acme Store"
      },
      "finalUrls": ["https://www.example.com/summer-sale"]
    }
  }
}
\`\`\`

## Get Ad

\`\`\`json
{
  "entityType": "ad",
  "customerId": "1234567890",
  "entityId": "777888999~111222333"
}
\`\`\`
> Ad IDs are composite: \`{adGroupId}~{adId}\`.

## Update Ad (Pause)

\`\`\`json
{
  "entityType": "ad",
  "customerId": "1234567890",
  "entityId": "777888999~111222333",
  "data": {
    "status": "PAUSED"
  },
  "updateMask": "status"
}
\`\`\`

## Remove Ad

\`\`\`json
{
  "entityType": "ad",
  "customerId": "1234567890",
  "entityId": "777888999~111222333"
}
\`\`\`
`;
}

function keywordExamplesMarkdown(): string {
  return `# Google Ads Keyword Examples

## Create Exact Match Keyword

\`\`\`json
{
  "entityType": "keyword",
  "customerId": "1234567890",
  "data": {
    "adGroup": "customers/1234567890/adGroups/777888999",
    "status": "ENABLED",
    "keyword": {
      "text": "running shoes",
      "matchType": "EXACT"
    },
    "cpcBidMicros": "3000000"
  }
}
\`\`\`
> Match types: BROAD, PHRASE, EXACT.
> \`cpcBidMicros\` overrides the ad group default bid.

## Create Phrase Match Keyword

\`\`\`json
{
  "entityType": "keyword",
  "customerId": "1234567890",
  "data": {
    "adGroup": "customers/1234567890/adGroups/777888999",
    "status": "ENABLED",
    "keyword": {
      "text": "best running shoes",
      "matchType": "PHRASE"
    }
  }
}
\`\`\`
> Omitting \`cpcBidMicros\` uses the ad group default bid.

## Create Negative Keyword

\`\`\`json
{
  "entityType": "keyword",
  "customerId": "1234567890",
  "data": {
    "adGroup": "customers/1234567890/adGroups/777888999",
    "status": "ENABLED",
    "negative": true,
    "keyword": {
      "text": "free",
      "matchType": "BROAD"
    }
  }
}
\`\`\`

## Get Keyword

\`\`\`json
{
  "entityType": "keyword",
  "customerId": "1234567890",
  "entityId": "777888999~444555666"
}
\`\`\`
> Keyword IDs are composite: \`{adGroupId}~{criterionId}\`.

## List Keywords for Ad Group

\`\`\`json
{
  "entityType": "keyword",
  "customerId": "1234567890",
  "filters": {
    "ad_group_criterion.ad_group": "= 'customers/1234567890/adGroups/777888999'"
  }
}
\`\`\`

## Update Keyword (Change Bid)

\`\`\`json
{
  "entityType": "keyword",
  "customerId": "1234567890",
  "entityId": "777888999~444555666",
  "data": {
    "cpcBidMicros": "4000000"
  },
  "updateMask": "cpcBidMicros"
}
\`\`\`
`;
}

function campaignBudgetExamplesMarkdown(): string {
  return `# Google Ads Campaign Budget Examples

## Create Daily Budget

\`\`\`json
{
  "entityType": "campaignBudget",
  "customerId": "1234567890",
  "data": {
    "name": "Daily Budget - $50",
    "amountMicros": "50000000",
    "deliveryMethod": "STANDARD"
  }
}
\`\`\`
> \`amountMicros\` is the daily budget in micros. $50/day = "50000000".
> \`deliveryMethod\`: STANDARD (evenly throughout the day) or ACCELERATED (spend as quickly as possible).

## Create Shared Budget

\`\`\`json
{
  "entityType": "campaignBudget",
  "customerId": "1234567890",
  "data": {
    "name": "Shared Budget - Brand Campaigns",
    "amountMicros": "100000000",
    "deliveryMethod": "STANDARD",
    "explicitlyShared": true
  }
}
\`\`\`
> Shared budgets can be linked to multiple campaigns. Set \`explicitlyShared: true\`.

## Get Campaign Budget

\`\`\`json
{
  "entityType": "campaignBudget",
  "customerId": "1234567890",
  "entityId": "111222333"
}
\`\`\`

## List Campaign Budgets

\`\`\`json
{
  "entityType": "campaignBudget",
  "customerId": "1234567890"
}
\`\`\`

## Update Campaign Budget (Increase)

\`\`\`json
{
  "entityType": "campaignBudget",
  "customerId": "1234567890",
  "entityId": "111222333",
  "data": {
    "amountMicros": "75000000"
  },
  "updateMask": "amountMicros"
}
\`\`\`
`;
}

function assetExamplesMarkdown(): string {
  return `# Google Ads Asset Examples

## Create Sitelink Asset

\`\`\`json
{
  "entityType": "asset",
  "customerId": "1234567890",
  "data": {
    "name": "Summer Sale Sitelink",
    "sitelinkAsset": {
      "linkText": "Summer Sale",
      "description1": "Up to 50% off all items",
      "description2": "Free shipping on orders over $50"
    },
    "finalUrls": ["https://www.example.com/summer-sale"]
  }
}
\`\`\`

## Create Callout Asset

\`\`\`json
{
  "entityType": "asset",
  "customerId": "1234567890",
  "data": {
    "name": "Free Shipping Callout",
    "calloutAsset": {
      "calloutText": "Free Shipping"
    }
  }
}
\`\`\`

## Create Structured Snippet Asset

\`\`\`json
{
  "entityType": "asset",
  "customerId": "1234567890",
  "data": {
    "name": "Brand Snippets",
    "structuredSnippetAsset": {
      "header": "Brands",
      "values": ["Nike", "Adidas", "New Balance", "Brooks"]
    }
  }
}
\`\`\`

## Create Image Asset

\`\`\`json
{
  "entityType": "asset",
  "customerId": "1234567890",
  "data": {
    "name": "Hero Banner Image",
    "imageAsset": {
      "data": "BASE64_ENCODED_IMAGE_DATA"
    }
  }
}
\`\`\`
> Image data must be base64-encoded. Supported formats: PNG, JPG, GIF.

## Get Asset

\`\`\`json
{
  "entityType": "asset",
  "customerId": "1234567890",
  "entityId": "999888777"
}
\`\`\`

## List Assets

\`\`\`json
{
  "entityType": "asset",
  "customerId": "1234567890"
}
\`\`\`
`;
}

// ─── Resource definitions ───

const EXAMPLE_GENERATORS: Record<string, () => string> = {
  campaign: campaignExamplesMarkdown,
  adgroup: adGroupExamplesMarkdown,
  ad: adExamplesMarkdown,
  keyword: keywordExamplesMarkdown,
  campaignbudget: campaignBudgetExamplesMarkdown,
  asset: assetExamplesMarkdown,
};

function getExampleContent(entityType: string): string {
  const key = entityType.toLowerCase();
  if (!cachedExamples.has(key)) {
    const generator = EXAMPLE_GENERATORS[key];
    if (generator) {
      cachedExamples.set(key, generator());
    } else {
      return `# Unknown entity type: ${entityType}\n\nSupported types: ${ENTITY_TYPES.join(", ")}`;
    }
  }
  return cachedExamples.get(key)!;
}

let cachedAllExamples: string | undefined;

function getAllExamplesMarkdown(): string {
  return ENTITY_TYPES.map((t) => getExampleContent(t)).join("\n---\n\n");
}

const ENTITY_TYPES = ["campaign", "adGroup", "ad", "keyword", "campaignBudget", "asset"] as const;

export const entityExampleResources: Resource[] = ENTITY_TYPES.map((entityType) => ({
  uri: `entity-examples://${entityType}`,
  name: `Google Ads ${entityType} Examples`,
  description: `CRUD example payloads for Google Ads ${entityType} entities including create, get, list, update, and remove`,
  mimeType: "text/markdown",
  getContent: () => getExampleContent(entityType),
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://all",
  name: "Google Ads All Entity Examples",
  description: "Combined CRUD example payloads for all Google Ads entity types",
  mimeType: "text/markdown",
  getContent: () => {
    cachedAllExamples ??= getAllExamplesMarkdown();
    return cachedAllExamples;
  },
};
