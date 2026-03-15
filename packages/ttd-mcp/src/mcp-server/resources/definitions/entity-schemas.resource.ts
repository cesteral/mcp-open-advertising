// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Entity Schema Resources
 *
 * Per-entity field reference for TTD API v3 entities.
 * 10 resources: 9 individual entity types + 1 aggregate.
 */
import type { Resource } from "../types.js";

const cachedSchemas = new Map<string, string>();

// ─── Field definitions per entity type ───

function advertiserSchemaMarkdown(): string {
  return `# TTD Advertiser Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`AdvertiserId\` | string | Read-only | Unique advertiser ID (assigned by TTD) |
| \`AdvertiserName\` | string | **Yes** | Display name |
| \`PartnerId\` | string | **Yes** | Partner ID this advertiser belongs to |
| \`Description\` | string | No | Advertiser description |
| \`CurrencyCode\` | string | **Yes** | ISO 4217 currency code (e.g., \`USD\`, \`EUR\`) |
| \`DefaultRightMediaOfferTypeId\` | string | No | Default offer type |
| \`AttributionClickLookbackWindowInSeconds\` | number | No | Click attribution window |
| \`AttributionImpressionLookbackWindowInSeconds\` | number | No | Impression attribution window |
| \`DomainAddress\` | string | No | Advertiser's website |
| \`LogoURL\` | string | No | URL to advertiser logo |
| \`IndustryCategoryId\` | number | No | Industry category |
| \`Availability\` | string | No | \`Available\` or \`Archived\` |

## Notes
- \`AdvertiserId\` is auto-assigned on creation; do not include in create payloads.
- \`CurrencyCode\` cannot be changed after creation.
- Partner-level users can create advertisers; advertiser-level users cannot.
`;
}

function campaignSchemaMarkdown(): string {
  return `# TTD Campaign Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`CampaignId\` | string | Read-only | Unique campaign ID (assigned by TTD) |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`CampaignName\` | string | **Yes** | Display name |
| \`Budget\` | object | **Yes** | Budget configuration (see below) |
| \`StartDate\` | string | **Yes** | ISO 8601 date (\`YYYY-MM-DDTHH:mm:ss\`) |
| \`EndDate\` | string | No | ISO 8601 date (omit for evergreen) |
| \`CampaignConversionReportingColumns\` | string[] | No | Conversion columns for reporting |
| \`PacingMode\` | string | No | \`PaceAhead\`, \`PaceEvenly\`, \`Off\` |
| \`DailyBudgetInAdvertiserCurrency\` | number | No | Daily budget cap |
| \`Availability\` | string | No | \`Available\`, \`Paused\`, \`Archived\` |
| \`FrequencyConfig\` | object | No | Frequency capping settings |
| \`TimeZone\` | string | No | IANA time zone (e.g., \`America/New_York\`) |
| \`PartnerCostPercentageFee\` | number | No | Partner cost percentage |
| \`Description\` | string | No | Campaign description |

## Budget Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`Amount\` | number | **Yes** | Total budget amount |
| \`CurrencyCode\` | string | No | Inherited from advertiser if omitted |

## FrequencyConfig Object

| Field | Type | Description |
|-------|------|-------------|
| \`MaxImpressions\` | number | Max impressions per user |
| \`TimeUnitCount\` | number | Number of time units |
| \`TimeUnit\` | string | \`Minutes\`, \`Hours\`, \`Days\`, \`Weeks\`, \`Months\` |

## Notes
- \`CampaignId\` is auto-assigned; do not include in create payloads.
- Budget \`Amount\` is lifetime budget (not daily).
- \`StartDate\` must be in the future for new campaigns.
- Set \`Availability\` to \`Paused\` to stop delivery without deleting.
`;
}

function adGroupSchemaMarkdown(): string {
  return `# TTD Ad Group Schema

## Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`AdGroupId\` | string | Read-only | Unique ad group ID (assigned by TTD) |
| \`CampaignId\` | string | **Yes** | Parent campaign |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`AdGroupName\` | string | **Yes** | Display name |
| \`RTBAttributes\` | object | **Yes** | Real-time bidding configuration (see below) |
| \`Description\` | string | No | Ad group description |
| \`IsEnabled\` | boolean | No | Whether ad group is active (default: \`true\`) |
| \`IndustryCategoryId\` | number | No | Industry category |
| \`Availability\` | string | No | \`Available\`, \`Paused\`, \`Archived\` |
| \`AssociatedBidLists\` | object[] | No | Bid lists for fine-grained bidding |
| \`Channel\` | string | No | \`Display\`, \`Video\`, \`Audio\`, \`CTV\`, \`DOOH\`, \`Native\` |
| \`FunnelLocation\` | string | No | \`Awareness\`, \`Consideration\`, \`Conversion\` |
| \`MarketType\` | string | No | \`OpenMarket\`, \`PrivateMarketOnly\`, \`ProgrammaticGuaranteed\` |
| \`ProgrammaticGuaranteedPrivateContractId\` | string | No | PG contract ID (when MarketType is PG) |

## RTBAttributes Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`BudgetSettings\` | object | **Yes** | Budget configuration |
| \`BaseBidCPM\` | object | **Yes** | Base bid amount |
| \`MaxBidCPM\` | object | No | Maximum bid cap |
| \`ROIGoal\` | object | No | ROI/CPA optimization goal |
| \`AudienceTargeting\` | object | No | First/third-party audience targeting |
| \`SiteTargeting\` | object | No | Site/app targeting |
| \`GeoTargeting\` | object | No | Geographic targeting |
| \`CreativeCategoryExclusions\` | string[] | No | Excluded creative categories |
| \`FrequencyConfig\` | object[] | No | Frequency capping (see below) |
| \`ContractTargeting\` | object | No | PMP/PG contract targeting settings |

## BudgetSettings Object

| Field | Type | Description |
|-------|------|-------------|
| \`Budget\` | object | \`{ Amount, CurrencyCode }\` |
| \`DailyBudget\` | object | \`{ Amount, CurrencyCode }\` |
| \`PacingMode\` | string | \`PaceAhead\`, \`PaceEvenly\`, \`Off\` |

## BaseBidCPM / MaxBidCPM Object

| Field | Type | Description |
|-------|------|-------------|
| \`Amount\` | number | Bid amount in currency |
| \`CurrencyCode\` | string | ISO 4217 code |

## AudienceTargeting Object

| Field | Type | Description |
|-------|------|-------------|
| \`AudienceId\` | string | First-party or third-party audience ID |
| \`AudienceAcceleratorExclusionsEnabled\` | boolean | Exclude users from audience accelerator |
| \`AudienceBoosterEnabled\` | boolean | Enable audience boosting (look-alike expansion) |
| \`AudienceExcluderEnabled\` | boolean | Enable audience exclusion |
| \`AudiencePredictorEnabled\` | boolean | Enable predictive audience matching |
| \`CrossDeviceVendorListForAudience\` | number[] | Cross-device graph vendor IDs |
| \`RecencyExclusionWindowInMinutes\` | number | Exclude recently-seen users |
| \`TargetTrackableUsersEnabled\` | boolean | Only target users with trackable IDs |

## ROIGoal Object (12 Goal Types)

| Field | Type | Description |
|-------|------|-------------|
| \`MaximizeReach\` | boolean | Optimize for maximum unique reach |
| \`MaximizeLtvIncrementalReach\` | boolean | Optimize for LTV incremental reach |
| \`CPCInAdvertiserCurrency\` | number | Target cost per click |
| \`CTRInPercent\` | number | Target click-through rate |
| \`CPAInAdvertiserCurrency\` | number | Target cost per acquisition |
| \`ReturnOnAdSpendPercent\` | number | Target ROAS percentage |
| \`VCRInPercent\` | number | Target video completion rate |
| \`ViewabilityInPercent\` | number | Target viewability rate |
| \`VCPMInAdvertiserCurrency\` | number | Target viewable CPM |
| \`CPCVInAdvertiserCurrency\` | number | Target cost per completed view |
| \`NielsenOTPInPercent\` | number | Target Nielsen on-target percentage |
| \`MiaozhenOTPInPercent\` | number | Target Miaozhen on-target percentage |

## FrequencyConfig (Ad Group Level)

| Field | Type | Description |
|-------|------|-------------|
| \`CounterName\` | string | Named counter (for cross-campaign coordination) |
| \`FrequencyCap\` | number | Max impressions per user in window |
| \`FrequencyGoal\` | number | Target impressions per user |
| \`ResetIntervalInMinutes\` | number | Frequency window reset interval |

## Flights (Budget Allocation per Campaign Flight)

| Field | Type | Description |
|-------|------|-------------|
| \`CampaignFlightId\` | number | Parent campaign flight ID |
| \`AllocationType\` | string | \`Maximum\` or \`Even\` |
| \`BudgetInAdvertiserCurrency\` | number | Flight budget in currency |
| \`BudgetInImpressions\` | number | Flight budget in impressions |
| \`DailyTargetInAdvertiserCurrency\` | number | Daily spend target |
| \`DailyTargetInImpressions\` | number | Daily impression target |

## Koa/Kokai AI Optimization Settings

| Field | Type | Description |
|-------|------|-------------|
| \`AreFutureKoaFeaturesEnabled\` | boolean | Opt-in to new Kokai AI features |
| \`PredictiveClearingEnabled\` | boolean | Enable predictive bid clearing |

## ContractTargeting Object

| Field | Type | Description |
|-------|------|-------------|
| \`AllowOpenMarketBiddingWhenTargetingContracts\` | boolean | Also bid on open market when targeting PMP contracts |

## AssociatedBidLists

| Field | Type | Description |
|-------|------|-------------|
| \`BidListId\` | string | Bid list ID to associate |
| \`IsEnabled\` | boolean | Whether this bid list is active |
| \`IsDefaultForDimension\` | boolean | Whether this is the default for its dimension |

## Notes
- \`AdGroupId\` is auto-assigned; do not include in create payloads.
- \`RTBAttributes\` is required and must include at minimum \`BudgetSettings\` and \`BaseBidCPM\`.
- Ad groups inherit campaign flight dates; ad group budget cannot exceed campaign budget.
- Targeting (geo, audience, device, site) is applied at the ad group level in TTD (not at ad level).
- Use \`ttd_adjust_bids\` tool for safe read-modify-write bid changes.
- Use \`Channel\` to specify ad format: Display, Video, Audio, CTV, DOOH.
- Use \`FunnelLocation\` to align with campaign objectives: Awareness, Consideration, Conversion.
`;
}

function adSchemaMarkdown(): string {
  return `# TTD Ad Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`AdId\` | string | Read-only | Unique ad ID (assigned by TTD) |
| \`AdGroupId\` | string | **Yes** | Parent ad group |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`AdName\` | string | **Yes** | Display name |
| \`CreativeIds\` | string[] | **Yes** | Associated creative IDs (at least one) |
| \`IsEnabled\` | boolean | No | Whether ad is active (default: \`true\`) |
| \`Availability\` | string | No | \`Available\`, \`Paused\`, \`Archived\` |
| \`LandingPageUrl\` | string | No | Click-through URL |
| \`AdFormat\` | string | No | \`Banner\`, \`Video\`, \`Native\`, \`Audio\` |
| \`Frequency\` | object | No | Ad-level frequency cap |
| \`ClickUrl\` | string | No | Click tracking URL |
| \`ImpressionTrackingUrls\` | string[] | No | Third-party impression trackers |
| \`IsClickTrackerAd\` | boolean | No | Whether this is a click tracker ad |
| \`Description\` | string | No | Ad description |

## Notes
- \`AdId\` is auto-assigned; do not include in create payloads.
- \`CreativeIds\` must reference existing creatives (use \`ttd_create_entity\` with \`entityType: "creative"\` first).
- Ads inherit targeting from their parent ad group.
- Multiple creatives per ad enables A/B testing (TTD auto-optimizes).
- Set \`IsEnabled: false\` to pause a specific ad without affecting the ad group.
`;
}

function creativeSchemaMarkdown(): string {
  return `# TTD Creative Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`CreativeId\` | string | Read-only | Unique creative ID (assigned by TTD) |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`CreativeName\` | string | **Yes** | Display name |
| \`CreativeType\` | string | **Yes** | \`Banner\`, \`Video\`, \`Native\`, \`Audio\`, \`HTML5\` |
| \`Width\` | number | Varies | Width in pixels (required for Banner/HTML5) |
| \`Height\` | number | Varies | Height in pixels (required for Banner/HTML5) |
| \`Tag\` | string | Varies | Third-party ad tag (for third-party served creatives) |
| \`HostedCreativeAssetUrl\` | string | Varies | URL for TTD-hosted creative asset |
| \`LandingPageUrl\` | string | No | Default click-through URL |
| \`ThirdPartyTrackingUrls\` | string[] | No | Third-party tracking pixels |
| \`IsHTTPS\` | boolean | No | Whether creative is HTTPS-compatible |
| \`Availability\` | string | No | \`Available\` or \`Archived\` |
| \`Description\` | string | No | Creative description |
| \`ExpandedSize\` | object | No | Expanded dimensions for expandable creatives |
| \`VideoAttributes\` | object | No | VAST URL, duration, skip settings (for video) |
| \`NativeAttributes\` | object | No | Title, body, icon, image (for native) |

## VideoAttributes Object

| Field | Type | Description |
|-------|------|-------------|
| \`VastUrl\` | string | VAST tag URL |
| \`DurationInSeconds\` | number | Video duration |
| \`IsSkippable\` | boolean | Whether user can skip |
| \`SkipOffsetInSeconds\` | number | Seconds before skip button appears |

## Notes
- Creatives must be created before they can be associated with ads.
- One creative can be reused across multiple ads and ad groups.
- Use \`CreativeType\` matching the ad group's \`Channel\` setting.
`;
}

function siteListSchemaMarkdown(): string {
  return `# TTD Site List Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`SiteListId\` | string | Read-only | Unique site list ID (assigned by TTD) |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`SiteListName\` | string | **Yes** | Display name |
| \`SiteListType\` | string | **Yes** | \`Whitelist\` (include) or \`Blacklist\` (exclude) |
| \`Sites\` | string[] | No | Array of domain/app names |
| \`Description\` | string | No | Site list description |
| \`Availability\` | string | No | \`Available\` or \`Archived\` |

## Notes
- Site lists are used in ad group \`SiteTargeting\` to include or exclude inventory.
- Can contain domains (e.g., \`example.com\`) or app bundle IDs.
- Whitelist = only bid on these sites; Blacklist = never bid on these sites.
- Changes to site lists take effect within minutes.
`;
}

function dealSchemaMarkdown(): string {
  return `# TTD Deal Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`DealId\` | string | Read-only | Unique deal ID (assigned by TTD) |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`DealName\` | string | **Yes** | Display name |
| \`DealType\` | string | **Yes** | \`PMP\` (private marketplace) or \`PG\` (programmatic guaranteed) |
| \`ExternalDealId\` | string | **Yes** | SSP-assigned deal ID |
| \`SupplyVendorId\` | string | **Yes** | Exchange/SSP vendor ID |
| \`DealPriceFloor\` | object | No | \`{ Amount, CurrencyCode }\` — minimum bid floor |
| \`StartDate\` | string | No | Deal start date (ISO 8601) |
| \`EndDate\` | string | No | Deal end date (ISO 8601) |
| \`Availability\` | string | No | \`Available\` or \`Archived\` |
| \`Description\` | string | No | Deal description |

## Notes
- Deals are set up between advertiser and publisher, then referenced in ad group \`ContractTargeting\`.
- \`ExternalDealId\` is the deal ID provided by the SSP/exchange.
- PMP deals use auction-based pricing; PG deals have fixed pricing.
`;
}

function conversionTrackerSchemaMarkdown(): string {
  return `# TTD Conversion Tracker Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`TrackingTagId\` | string | Read-only | Unique tracker ID (assigned by TTD) |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`TrackingTagName\` | string | **Yes** | Display name |
| \`TrackingTagType\` | string | **Yes** | \`Standard\`, \`Custom\`, \`UniversalPixel\` |
| \`TrackingTagCategory\` | string | No | \`PageView\`, \`Purchase\`, \`SignUp\`, \`AddToCart\`, \`Lead\`, \`Other\` |
| \`ConversionType\` | string | No | \`PostClick\`, \`PostView\`, \`Both\` |
| \`ClickLookbackWindowInSeconds\` | number | No | Click attribution window |
| \`ViewLookbackWindowInSeconds\` | number | No | View-through attribution window |
| \`CountingMethod\` | string | No | \`OnePerSession\`, \`OnePerUser\`, \`All\` |
| \`TrackingTagUrl\` | string | Read-only | The pixel URL to deploy |
| \`Availability\` | string | No | \`Available\` or \`Archived\` |
| \`Description\` | string | No | Tracker description |

## Notes
- Deploy the \`TrackingTagUrl\` on your conversion pages after creation.
- Conversion data feeds into campaign/ad group optimization when using CPA or ROAS ROI goals.
- \`UniversalPixel\` type supports multiple conversion events on a single tag.
`;
}

function bidListSchemaMarkdown(): string {
  return `# TTD Bid List Schema

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`BidListId\` | string | Read-only | Unique bid list ID (assigned by TTD) |
| \`AdvertiserId\` | string | **Yes** | Parent advertiser |
| \`BidListName\` | string | **Yes** | Display name |
| \`BidListDimension\` | string | **Yes** | Dimension for bid adjustments (e.g., \`GeoRegion\`, \`DeviceType\`, \`TimeOfDay\`, \`Browser\`, \`OS\`) |
| \`BidListAdjustmentType\` | string | **Yes** | \`PercentageAdjustment\` or \`AbsoluteBid\` |
| \`BidListEntries\` | object[] | No | Individual bid adjustments per dimension value |
| \`Availability\` | string | No | \`Available\` or \`Archived\` |
| \`Description\` | string | No | Bid list description |

## BidListEntries Object

| Field | Type | Description |
|-------|------|-------------|
| \`DimensionValue\` | string | Specific value to adjust (e.g., \`US-CA\`, \`Desktop\`) |
| \`AdjustmentValue\` | number | Percentage (+/- from base) or absolute CPM |
| \`IsEnabled\` | boolean | Whether this entry is active |

## Notes
- Bid lists allow fine-grained bid modifiers by dimension (geo, device, time, etc.).
- Associate bid lists with ad groups via the \`AssociatedBidLists\` field.
- Percentage adjustments: +50 means bid 50% higher; -30 means bid 30% lower.
`;
}

// ─── Schema content lookup ───

const SCHEMA_GENERATORS: Record<string, () => string> = {
  advertiser: advertiserSchemaMarkdown,
  campaign: campaignSchemaMarkdown,
  adgroup: adGroupSchemaMarkdown,
  ad: adSchemaMarkdown,
  creative: creativeSchemaMarkdown,
  sitelist: siteListSchemaMarkdown,
  deal: dealSchemaMarkdown,
  conversiontracker: conversionTrackerSchemaMarkdown,
  bidlist: bidListSchemaMarkdown,
};

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

export const entitySchemaResources: Resource[] = ENTITY_TYPES.map((entityType) => ({
  uri: `entity-schema://${entityType}`,
  name: `TTD ${entityType} Schema`,
  description: `Field reference for TTD ${entityType} entities including required fields, types, and nested objects`,
  mimeType: "text/markdown",
  getContent: () => getSchemaContent(entityType),
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://all",
  name: "TTD All Entity Schemas",
  description: "Combined field reference for all TTD entity types",
  mimeType: "text/markdown",
  getContent: () => {
    cachedAllSchemas ??= getAllSchemasMarkdown();
    return cachedAllSchemas;
  },
};