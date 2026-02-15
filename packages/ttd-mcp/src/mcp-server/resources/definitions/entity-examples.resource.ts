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

// ─── New entity examples ───

function creativeExamplesMarkdown(): string {
  return `# TTD Creative Examples

## Create Banner Creative

\`\`\`json
{
  "entityType": "creative",
  "advertiserId": "abc123",
  "data": {
    "CreativeName": "Banner 300x250 - Summer Sale",
    "AdvertiserId": "abc123",
    "CreativeType": "Banner",
    "Width": 300,
    "Height": 250,
    "Tag": "<script src='https://cdn.example.com/ad/summer.js'></script>",
    "LandingPageUrl": "https://www.acme.com/summer-sale",
    "IsHTTPS": true
  }
}
\`\`\`

## Create Video Creative (VAST)

\`\`\`json
{
  "entityType": "creative",
  "advertiserId": "abc123",
  "data": {
    "CreativeName": "Pre-roll 30s - Brand Intro",
    "AdvertiserId": "abc123",
    "CreativeType": "Video",
    "VideoAttributes": {
      "VastUrl": "https://vast.example.com/brand-intro.xml",
      "DurationInSeconds": 30,
      "IsSkippable": true,
      "SkipOffsetInSeconds": 5
    }
  }
}
\`\`\`
`;
}

function siteListExamplesMarkdown(): string {
  return `# TTD Site List Examples

## Create Whitelist (Include Only)

\`\`\`json
{
  "entityType": "siteList",
  "advertiserId": "abc123",
  "data": {
    "SiteListName": "Premium Publishers - Q1",
    "AdvertiserId": "abc123",
    "SiteListType": "Whitelist",
    "Sites": ["nytimes.com", "washingtonpost.com", "cnn.com", "bbc.com"],
    "Description": "Premium news publishers for brand safety"
  }
}
\`\`\`

## Create Blacklist (Exclude)

\`\`\`json
{
  "entityType": "siteList",
  "advertiserId": "abc123",
  "data": {
    "SiteListName": "Brand Safety Exclusions",
    "AdvertiserId": "abc123",
    "SiteListType": "Blacklist",
    "Sites": ["clickbait-site.com", "low-quality-news.com"]
  }
}
\`\`\`
`;
}

function dealExamplesMarkdown(): string {
  return `# TTD Deal Examples

## Create PMP Deal

\`\`\`json
{
  "entityType": "deal",
  "advertiserId": "abc123",
  "data": {
    "DealName": "NYT Premium Inventory - Q1",
    "AdvertiserId": "abc123",
    "DealType": "PMP",
    "ExternalDealId": "nyt-pmp-2025-q1",
    "SupplyVendorId": "google-adx",
    "DealPriceFloor": { "Amount": 8.00, "CurrencyCode": "USD" },
    "StartDate": "2025-01-01T00:00:00",
    "EndDate": "2025-03-31T23:59:59"
  }
}
\`\`\`
`;
}

function conversionTrackerExamplesMarkdown(): string {
  return `# TTD Conversion Tracker Examples

## Create Purchase Tracker

\`\`\`json
{
  "entityType": "conversionTracker",
  "advertiserId": "abc123",
  "data": {
    "TrackingTagName": "Purchase - Thank You Page",
    "AdvertiserId": "abc123",
    "TrackingTagType": "Standard",
    "TrackingTagCategory": "Purchase",
    "ConversionType": "Both",
    "ClickLookbackWindowInSeconds": 2592000,
    "ViewLookbackWindowInSeconds": 86400,
    "CountingMethod": "OnePerSession"
  }
}
\`\`\`

## Create Lead Gen Tracker

\`\`\`json
{
  "entityType": "conversionTracker",
  "advertiserId": "abc123",
  "data": {
    "TrackingTagName": "Lead Form Submit",
    "AdvertiserId": "abc123",
    "TrackingTagType": "Standard",
    "TrackingTagCategory": "Lead",
    "ConversionType": "PostClick",
    "CountingMethod": "OnePerUser"
  }
}
\`\`\`
`;
}

function bidListExamplesMarkdown(): string {
  return `# TTD Bid List Examples

## Create Geo Bid Adjustments

\`\`\`json
{
  "entityType": "bidList",
  "advertiserId": "abc123",
  "data": {
    "BidListName": "US State Bid Modifiers",
    "AdvertiserId": "abc123",
    "BidListDimension": "GeoRegion",
    "BidListAdjustmentType": "PercentageAdjustment",
    "BidListEntries": [
      { "DimensionValue": "US-CA", "AdjustmentValue": 50, "IsEnabled": true },
      { "DimensionValue": "US-NY", "AdjustmentValue": 30, "IsEnabled": true },
      { "DimensionValue": "US-TX", "AdjustmentValue": -20, "IsEnabled": true }
    ]
  }
}
\`\`\`

## Create Device Bid Adjustments

\`\`\`json
{
  "entityType": "bidList",
  "advertiserId": "abc123",
  "data": {
    "BidListName": "Device Type Modifiers",
    "AdvertiserId": "abc123",
    "BidListDimension": "DeviceType",
    "BidListAdjustmentType": "PercentageAdjustment",
    "BidListEntries": [
      { "DimensionValue": "Desktop", "AdjustmentValue": 20, "IsEnabled": true },
      { "DimensionValue": "Mobile", "AdjustmentValue": -10, "IsEnabled": true },
      { "DimensionValue": "CTV", "AdjustmentValue": 40, "IsEnabled": true }
    ]
  }
}
\`\`\`
`;
}

// ─── Resource definitions ───

const EXAMPLE_GENERATORS: Record<string, () => string> = {
  advertiser: advertiserExamplesMarkdown,
  campaign: campaignExamplesMarkdown,
  adgroup: adGroupExamplesMarkdown,
  ad: adExamplesMarkdown,
  creative: creativeExamplesMarkdown,
  sitelist: siteListExamplesMarkdown,
  deal: dealExamplesMarkdown,
  conversiontracker: conversionTrackerExamplesMarkdown,
  bidlist: bidListExamplesMarkdown,
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

const ENTITY_TYPES = [
  "advertiser",
  "campaign",
  "adGroup",
  "ad",
  "creative",
  "siteList",
  "deal",
  "conversionTracker",
  "bidList",
] as const;

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
