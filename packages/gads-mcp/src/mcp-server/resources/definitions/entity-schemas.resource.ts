/**
 * Google Ads Entity Schema Resources
 *
 * Per-entity field reference for Google Ads API v23 entities.
 */
import type { Resource } from "../types.js";

const cachedSchemas = new Map<string, string>();

function campaignSchemaMarkdown(): string {
  return `# Google Ads Campaign Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **Yes** | Campaign name (unique within account) |
| \`advertisingChannelType\` | enum | **Yes** | \`SEARCH\`, \`DISPLAY\`, \`SHOPPING\`, \`VIDEO\`, \`MULTI_CHANNEL\`, \`PERFORMANCE_MAX\`, \`DEMAND_GEN\` |
| \`status\` | enum | No | \`ENABLED\`, \`PAUSED\`, \`REMOVED\` (default: \`ENABLED\`) |
| \`campaignBudget\` | string | **Yes** | Resource name of the campaign budget (e.g., \`customers/{id}/campaignBudgets/{budgetId}\`) |
| \`startDate\` | string | No | Start date in YYYY-MM-DD format |
| \`endDate\` | string | No | End date in YYYY-MM-DD format |
| \`biddingStrategyType\` | enum | No | \`MANUAL_CPC\`, \`MAXIMIZE_CONVERSIONS\`, \`MAXIMIZE_CONVERSION_VALUE\`, \`TARGET_CPA\`, \`TARGET_ROAS\`, etc. |
| \`manualCpc\` | object | Cond. | Manual CPC settings (when biddingStrategyType = MANUAL_CPC) |
| \`maximizeConversions\` | object | Cond. | Maximize conversions settings |
| \`targetCpa\` | object | Cond. | Target CPA settings with \`targetCpaMicros\` |
| \`targetRoas\` | object | Cond. | Target ROAS settings with \`targetRoas\` (float) |
| \`networkSettings\` | object | No | Network targeting (Search, Display, YouTube, partners) |
| \`geoTargetTypeSetting\` | object | No | Geo targeting type configuration |
| \`frequencyCaps\` | object[] | No | Frequency capping rules |
| \`urlCustomParameters\` | object[] | No | Custom URL parameters |

## Network Settings Object

| Field | Type | Description |
|-------|------|-------------|
| \`targetGoogleSearch\` | boolean | Show ads on Google Search |
| \`targetSearchNetwork\` | boolean | Show ads on search partner sites |
| \`targetContentNetwork\` | boolean | Show ads on Display Network |
| \`targetPartnerSearchNetwork\` | boolean | Show ads on partner search network |

## Notes
- \`campaignBudget\` must reference an existing CampaignBudget resource (create budget first).
- \`advertisingChannelType\` cannot be changed after creation.
- Use \`PERFORMANCE_MAX\` for AI-optimized campaigns across all Google surfaces.
- Bidding strategy fields are mutually exclusive — set only one.
`;
}

function adGroupSchemaMarkdown(): string {
  return `# Google Ads Ad Group Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **Yes** | Ad group name |
| \`campaign\` | string | **Yes** | Parent campaign resource name |
| \`status\` | enum | No | \`ENABLED\`, \`PAUSED\`, \`REMOVED\` |
| \`type\` | enum | No | \`SEARCH_STANDARD\`, \`DISPLAY_STANDARD\`, \`SHOPPING_PRODUCT_ADS\`, \`VIDEO_BUMPER\`, etc. |
| \`cpcBidMicros\` | string (int64) | No | Default max CPC bid in micros (1,000,000 micros = 1 currency unit) |
| \`cpmBidMicros\` | string (int64) | No | Default CPM bid in micros |
| \`targetCpaMicros\` | string (int64) | No | Target CPA bid in micros |
| \`targetRoas\` | number | No | Target ROAS (e.g., 2.0 = 200% return) |
| \`adRotationMode\` | enum | No | \`OPTIMIZE\`, \`ROTATE_FOREVER\` |
| \`urlCustomParameters\` | object[] | No | Custom URL parameters |

## Notes
- \`campaign\` must be a valid campaign resource name: \`customers/{customerId}/campaigns/{campaignId}\`.
- \`cpcBidMicros\` is in micros: to set $2.50 bid, use \`"2500000"\`.
- Ad group type is typically inferred from the parent campaign's channel type.
- For Display campaigns, targeting options (audiences, placements) are set separately.
`;
}

function adSchemaMarkdown(): string {
  return `# Google Ads Ad (AdGroupAd) Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`adGroup\` | string | **Yes** | Parent ad group resource name |
| \`status\` | enum | No | \`ENABLED\`, \`PAUSED\`, \`REMOVED\` |
| \`ad\` | object | **Yes** | The ad creative object (see below) |

## Ad Object (varies by type)

### Responsive Search Ad

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`responsiveSearchAd\` | object | **Yes** | RSA creative content |
| \`responsiveSearchAd.headlines\` | object[] | **Yes** | 3-15 headline options (\`{ text: string }\`) |
| \`responsiveSearchAd.descriptions\` | object[] | **Yes** | 2-4 description options (\`{ text: string }\`) |
| \`responsiveSearchAd.path1\` | string | No | Display URL path 1 (max 15 chars) |
| \`responsiveSearchAd.path2\` | string | No | Display URL path 2 (max 15 chars) |
| \`finalUrls\` | string[] | **Yes** | Landing page URLs |
| \`finalMobileUrls\` | string[] | No | Mobile-specific landing pages |
| \`trackingUrlTemplate\` | string | No | Tracking URL template |

### Responsive Display Ad

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`responsiveDisplayAd\` | object | **Yes** | Display ad content |
| \`responsiveDisplayAd.headlines\` | object[] | **Yes** | Short headlines |
| \`responsiveDisplayAd.longHeadline\` | object | **Yes** | Long headline |
| \`responsiveDisplayAd.descriptions\` | object[] | **Yes** | Description options |
| \`responsiveDisplayAd.marketingImages\` | object[] | **Yes** | Marketing image assets |
| \`responsiveDisplayAd.squareMarketingImages\` | object[] | No | Square format images |
| \`responsiveDisplayAd.businessName\` | string | **Yes** | Business/brand name |
| \`finalUrls\` | string[] | **Yes** | Landing page URLs |

## Notes
- Google Ads strongly favors Responsive Search Ads (RSA) over expanded text ads.
- Provide 8-15 headlines and 3-4 descriptions for best RSA performance.
- Headlines max 30 chars each; descriptions max 90 chars each.
- \`finalUrls\` is required for all ad types.
`;
}

function keywordSchemaMarkdown(): string {
  return `# Google Ads Keyword (AdGroupCriterion) Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`adGroup\` | string | **Yes** | Parent ad group resource name |
| \`status\` | enum | No | \`ENABLED\`, \`PAUSED\`, \`REMOVED\` |
| \`keyword\` | object | **Yes** | Keyword targeting settings |
| \`keyword.text\` | string | **Yes** | The keyword text |
| \`keyword.matchType\` | enum | **Yes** | \`BROAD\`, \`PHRASE\`, \`EXACT\` |
| \`cpcBidMicros\` | string (int64) | No | Keyword-level max CPC bid override (in micros) |
| \`finalUrls\` | string[] | No | Keyword-level landing page override |
| \`negative\` | boolean | No | Whether this is a negative keyword |

## Match Types

| Match Type | Behavior | Example for "running shoes" |
|------------|----------|---------------------------|
| \`BROAD\` | Shows for related searches | "buy sneakers", "jogging footwear" |
| \`PHRASE\` | Shows when search includes phrase | "best running shoes", "running shoes sale" |
| \`EXACT\` | Shows for exact or close variant | "running shoes", "running shoe" |

## Notes
- Keywords are created as AdGroupCriterion resources.
- Bid in micros: $1.50 = \`"1500000"\`.
- Negative keywords exclude searches — set \`negative: true\`.
- Broad match is recommended with Smart Bidding strategies.
`;
}

function campaignBudgetSchemaMarkdown(): string {
  return `# Google Ads Campaign Budget Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | No | Budget name (for reference) |
| \`amountMicros\` | string (int64) | **Yes** | Daily budget in micros (1,000,000 micros = 1 currency unit) |
| \`deliveryMethod\` | enum | No | \`STANDARD\` (spread evenly) or \`ACCELERATED\` (spend quickly, limited availability) |
| \`explicitlyShared\` | boolean | No | Whether budget is shared across campaigns |
| \`status\` | enum | Read-only | \`ENABLED\`, \`REMOVED\` |
| \`totalAmountMicros\` | string (int64) | No | Total lifetime budget in micros (optional) |

## Notes
- Create budget first, then reference it in campaign creation via \`campaignBudget\` field.
- \`amountMicros\` is the **daily** budget: $50/day = \`"50000000"\`.
- A budget can be shared across multiple campaigns if \`explicitlyShared: true\`.
- \`STANDARD\` delivery is recommended — spreads spend evenly throughout the day.
`;
}

function assetSchemaMarkdown(): string {
  return `# Google Ads Asset Schema

## Overview

Assets are reusable building blocks (text, images, videos, etc.) that can be linked to
campaigns and ad groups via CampaignAsset and AdGroupAsset associations.

## Common Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | No | Optional asset name for reference |
| \`type\` | enum | Read-only | Auto-set based on asset content: \`TEXT\`, \`IMAGE\`, \`YOUTUBE_VIDEO\`, \`CALLOUT\`, \`SITELINK\`, \`CALL\`, \`STRUCTURED_SNIPPET\`, etc. |
| \`resourceName\` | string | Read-only | \`customers/{customerId}/assets/{assetId}\` |

## Asset Type-Specific Fields

### Text Asset
| Field | Type | Description |
|-------|------|-------------|
| \`textAsset.text\` | string | The text content |

### Image Asset
| Field | Type | Description |
|-------|------|-------------|
| \`imageAsset.data\` | bytes (base64) | Raw image data |
| \`imageAsset.fileSize\` | int64 | File size in bytes |
| \`imageAsset.mimeType\` | enum | \`IMAGE_JPEG\`, \`IMAGE_PNG\`, \`IMAGE_GIF\` |
| \`imageAsset.fullSize\` | object | Full-size image dimensions |

### Sitelink Asset
| Field | Type | Description |
|-------|------|-------------|
| \`sitelinkAsset.linkText\` | string | Sitelink anchor text (max 25 chars) |
| \`sitelinkAsset.description1\` | string | Description line 1 |
| \`sitelinkAsset.description2\` | string | Description line 2 |
| \`finalUrls\` | string[] | Landing page URLs |

### Callout Asset
| Field | Type | Description |
|-------|------|-------------|
| \`calloutAsset.calloutText\` | string | Callout text (max 25 chars) |

### Call Asset
| Field | Type | Description |
|-------|------|-------------|
| \`callAsset.countryCode\` | string | Two-letter country code |
| \`callAsset.phoneNumber\` | string | Phone number string |

## Notes
- Assets replaced the legacy Extension Feed Items API (removed in API v23).
- Create assets first, then link via \`CampaignAsset\` or \`AdGroupAsset\` associations.
- Assets can be shared across multiple campaigns/ad groups.
- At least 2 sitelink assets recommended for best ad performance.
`;
}

// ─── Schema content lookup ───

const SCHEMA_GENERATORS: Record<string, () => string> = {
  campaign: campaignSchemaMarkdown,
  adgroup: adGroupSchemaMarkdown,
  ad: adSchemaMarkdown,
  keyword: keywordSchemaMarkdown,
  campaignbudget: campaignBudgetSchemaMarkdown,
  asset: assetSchemaMarkdown,
};

const ENTITY_TYPES = [
  "campaign",
  "adGroup",
  "ad",
  "keyword",
  "campaignBudget",
  "asset",
] as const;

function getSchemaContent(entityType: string): string {
  const key = entityType.toLowerCase();
  if (!cachedSchemas.has(key)) {
    const generator = SCHEMA_GENERATORS[key];
    if (generator) {
      cachedSchemas.set(key, generator());
    } else {
      return `# Unknown entity type: ${entityType}\n\nSupported types: ${ENTITY_TYPES.join(", ")}`;
    }
  }
  return cachedSchemas.get(key)!;
}

let cachedAllSchemas: string | undefined;

function getAllSchemasMarkdown(): string {
  return ENTITY_TYPES.map((t) => getSchemaContent(t)).join("\n---\n\n");
}

export const entitySchemaResources: Resource[] = ENTITY_TYPES.map((entityType) => ({
  uri: `entity-schema://${entityType}`,
  name: `Google Ads ${entityType} Schema`,
  description: `Field reference for Google Ads ${entityType} entities including required fields, types, and nested objects`,
  mimeType: "text/markdown",
  getContent: () => getSchemaContent(entityType),
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://all",
  name: "Google Ads All Entity Schemas",
  description: "Combined field reference for all Google Ads entity types",
  mimeType: "text/markdown",
  getContent: () => {
    cachedAllSchemas ??= getAllSchemasMarkdown();
    return cachedAllSchemas;
  },
};
