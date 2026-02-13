/**
 * TTD Entity Example Resources
 *
 * CRUD example payloads for each TTD entity type.
 * 5 resources: 4 individual entity types + 1 aggregate.
 */
import type { Resource } from "../types.js";

const cachedExamples = new Map<string, string>();

// ─── Example content per entity type ───

function advertiserExamplesMarkdown(): string {
  return `# TTD Advertiser Examples

## Create Advertiser

\`\`\`json
{
  "entityType": "advertiser",
  "data": {
    "AdvertiserName": "Acme Corp",
    "PartnerId": "your-partner-id",
    "CurrencyCode": "USD",
    "Description": "Acme Corporation advertising account",
    "DomainAddress": "https://www.acme.com",
    "AttributionClickLookbackWindowInSeconds": 2592000,
    "AttributionImpressionLookbackWindowInSeconds": 2592000
  }
}
\`\`\`

## Get Advertiser

\`\`\`json
{
  "entityType": "advertiser",
  "entityId": "abc123"
}
\`\`\`

## List Advertisers

\`\`\`json
{
  "entityType": "advertiser",
  "filters": {}
}
\`\`\`
> Lists all advertisers under your partner ID (automatically scoped).

## Update Advertiser

\`\`\`json
{
  "entityType": "advertiser",
  "entityId": "abc123",
  "data": {
    "AdvertiserName": "Acme Corp (Updated)",
    "Description": "Updated description"
  }
}
\`\`\`
> Note: \`CurrencyCode\` cannot be changed after creation.
`;
}

function campaignExamplesMarkdown(): string {
  return `# TTD Campaign Examples

## Create Campaign (Basic)

\`\`\`json
{
  "entityType": "campaign",
  "advertiserId": "abc123",
  "data": {
    "CampaignName": "Q1 2025 Brand Awareness",
    "AdvertiserId": "abc123",
    "Budget": {
      "Amount": 50000,
      "CurrencyCode": "USD"
    },
    "StartDate": "2025-03-01T00:00:00",
    "EndDate": "2025-03-31T23:59:59",
    "PacingMode": "PaceEvenly"
  }
}
\`\`\`

## Create Campaign (With Frequency Capping)

\`\`\`json
{
  "entityType": "campaign",
  "advertiserId": "abc123",
  "data": {
    "CampaignName": "Q1 Retargeting - Capped",
    "AdvertiserId": "abc123",
    "Budget": {
      "Amount": 25000,
      "CurrencyCode": "USD"
    },
    "StartDate": "2025-03-01T00:00:00",
    "EndDate": "2025-06-30T23:59:59",
    "PacingMode": "PaceAhead",
    "FrequencyConfig": {
      "MaxImpressions": 5,
      "TimeUnitCount": 1,
      "TimeUnit": "Days"
    }
  }
}
\`\`\`

## List Campaigns for Advertiser

\`\`\`json
{
  "entityType": "campaign",
  "filters": {
    "AdvertiserIds": ["abc123"]
  }
}
\`\`\`

## Update Campaign (Pause)

\`\`\`json
{
  "entityType": "campaign",
  "entityId": "camp456",
  "data": {
    "Availability": "Paused"
  }
}
\`\`\`

## Update Campaign (Adjust Budget)

\`\`\`json
{
  "entityType": "campaign",
  "entityId": "camp456",
  "data": {
    "Budget": {
      "Amount": 75000,
      "CurrencyCode": "USD"
    }
  }
}
\`\`\`
`;
}

function adGroupExamplesMarkdown(): string {
  return `# TTD Ad Group Examples

## Create Ad Group (Basic)

\`\`\`json
{
  "entityType": "adGroup",
  "advertiserId": "abc123",
  "data": {
    "AdGroupName": "Prospecting - Display",
    "CampaignId": "camp456",
    "AdvertiserId": "abc123",
    "RTBAttributes": {
      "BudgetSettings": {
        "Budget": {
          "Amount": 10000,
          "CurrencyCode": "USD"
        },
        "DailyBudget": {
          "Amount": 500,
          "CurrencyCode": "USD"
        },
        "PacingMode": "PaceEvenly"
      },
      "BaseBidCPM": {
        "Amount": 5.00,
        "CurrencyCode": "USD"
      },
      "MaxBidCPM": {
        "Amount": 12.00,
        "CurrencyCode": "USD"
      }
    }
  }
}
\`\`\`

## Create Ad Group (With Geo Targeting)

\`\`\`json
{
  "entityType": "adGroup",
  "advertiserId": "abc123",
  "data": {
    "AdGroupName": "US Only - Video",
    "CampaignId": "camp456",
    "AdvertiserId": "abc123",
    "RTBAttributes": {
      "BudgetSettings": {
        "Budget": {
          "Amount": 5000,
          "CurrencyCode": "USD"
        },
        "PacingMode": "PaceEvenly"
      },
      "BaseBidCPM": {
        "Amount": 8.00,
        "CurrencyCode": "USD"
      },
      "GeoTargeting": {
        "CountryCodeInclusions": ["US"],
        "RegionInclusions": ["US-CA", "US-NY"]
      }
    }
  }
}
\`\`\`

## List Ad Groups for Campaign

\`\`\`json
{
  "entityType": "adGroup",
  "filters": {
    "CampaignId": "camp456"
  }
}
\`\`\`

## Update Ad Group (Adjust Bids)

\`\`\`json
{
  "entityType": "adGroup",
  "entityId": "ag789",
  "data": {
    "RTBAttributes": {
      "BaseBidCPM": {
        "Amount": 6.50,
        "CurrencyCode": "USD"
      },
      "MaxBidCPM": {
        "Amount": 15.00,
        "CurrencyCode": "USD"
      }
    }
  }
}
\`\`\`

## Update Ad Group (Pause)

\`\`\`json
{
  "entityType": "adGroup",
  "entityId": "ag789",
  "data": {
    "Availability": "Paused"
  }
}
\`\`\`
`;
}

function adExamplesMarkdown(): string {
  return `# TTD Ad Examples

## Create Ad (Single Creative)

\`\`\`json
{
  "entityType": "ad",
  "advertiserId": "abc123",
  "data": {
    "AdName": "Banner 300x250 - Version A",
    "AdGroupId": "ag789",
    "AdvertiserId": "abc123",
    "CreativeIds": ["cr001"],
    "LandingPageUrl": "https://www.acme.com/promo",
    "AdFormat": "Banner"
  }
}
\`\`\`

## Create Ad (Multiple Creatives for A/B Test)

\`\`\`json
{
  "entityType": "ad",
  "advertiserId": "abc123",
  "data": {
    "AdName": "Video Pre-roll - A/B Test",
    "AdGroupId": "ag789",
    "AdvertiserId": "abc123",
    "CreativeIds": ["cr002", "cr003", "cr004"],
    "LandingPageUrl": "https://www.acme.com/video-landing",
    "AdFormat": "Video",
    "ImpressionTrackingUrls": [
      "https://tracker.example.com/imp?campaign=q1"
    ]
  }
}
\`\`\`

## List Ads for Ad Group

\`\`\`json
{
  "entityType": "ad",
  "filters": {
    "AdGroupId": "ag789"
  }
}
\`\`\`

## Update Ad (Change Creative)

\`\`\`json
{
  "entityType": "ad",
  "entityId": "ad101",
  "data": {
    "CreativeIds": ["cr005"],
    "LandingPageUrl": "https://www.acme.com/new-landing"
  }
}
\`\`\`

## Update Ad (Disable)

\`\`\`json
{
  "entityType": "ad",
  "entityId": "ad101",
  "data": {
    "IsEnabled": false
  }
}
\`\`\`

## Delete Ad

\`\`\`json
{
  "entityType": "ad",
  "entityId": "ad101"
}
\`\`\`
`;
}

// ─── Resource definitions ───

function getExampleContent(entityType: string): string {
  const key = entityType.toLowerCase();
  if (!cachedExamples.has(key)) {
    switch (key) {
      case "advertiser":
        cachedExamples.set(key, advertiserExamplesMarkdown());
        break;
      case "campaign":
        cachedExamples.set(key, campaignExamplesMarkdown());
        break;
      case "adgroup":
        cachedExamples.set(key, adGroupExamplesMarkdown());
        break;
      case "ad":
        cachedExamples.set(key, adExamplesMarkdown());
        break;
      default:
        return `# Unknown entity type: ${entityType}\n\nSupported types: advertiser, campaign, adGroup, ad`;
    }
  }
  return cachedExamples.get(key)!;
}

let cachedAllExamples: string | undefined;

function getAllExamplesMarkdown(): string {
  return [
    advertiserExamplesMarkdown(),
    campaignExamplesMarkdown(),
    adGroupExamplesMarkdown(),
    adExamplesMarkdown(),
  ].join("\n---\n\n");
}

const ENTITY_TYPES = ["advertiser", "campaign", "adGroup", "ad"] as const;

export const entityExampleResources: Resource[] = ENTITY_TYPES.map((entityType) => ({
  uri: `entity-examples://${entityType}`,
  name: `TTD ${entityType} Examples`,
  description: `CRUD example payloads for TTD ${entityType} entities including create, list, update, and delete`,
  mimeType: "text/markdown",
  getContent: () => getExampleContent(entityType),
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://all",
  name: "TTD All Entity Examples",
  description: "Combined CRUD example payloads for all TTD entity types",
  mimeType: "text/markdown",
  getContent: () => {
    cachedAllExamples ??= getAllExamplesMarkdown();
    return cachedAllExamples;
  },
};
