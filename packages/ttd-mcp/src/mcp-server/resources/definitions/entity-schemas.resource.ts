/**
 * TTD Entity Schema Resources
 *
 * Per-entity field reference for TTD API v3 entities.
 * 5 resources: 4 individual entity types + 1 aggregate.
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

## Fields

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

## Notes
- \`AdGroupId\` is auto-assigned; do not include in create payloads.
- \`RTBAttributes\` is required and must include at minimum \`BudgetSettings\` and \`BaseBidCPM\`.
- Ad groups inherit campaign flight dates; ad group budget cannot exceed campaign budget.
- Targeting is applied at the ad group level in TTD (not at ad level).
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
- \`CreativeIds\` must reference existing creatives (create creatives first).
- Ads inherit targeting from their parent ad group.
- Multiple creatives per ad enables A/B testing (TTD auto-optimizes).
- Set \`IsEnabled: false\` to pause a specific ad without affecting the ad group.
`;
}

// ─── Resource definitions ───

function getSchemaContent(entityType: string): string {
  const key = entityType.toLowerCase();
  if (!cachedSchemas.has(key)) {
    switch (key) {
      case "advertiser":
        cachedSchemas.set(key, advertiserSchemaMarkdown());
        break;
      case "campaign":
        cachedSchemas.set(key, campaignSchemaMarkdown());
        break;
      case "adgroup":
        cachedSchemas.set(key, adGroupSchemaMarkdown());
        break;
      case "ad":
        cachedSchemas.set(key, adSchemaMarkdown());
        break;
      default:
        return `# Unknown entity type: ${entityType}\n\nSupported types: advertiser, campaign, adGroup, ad`;
    }
  }
  return cachedSchemas.get(key)!;
}

let cachedAllSchemas: string | undefined;

function getAllSchemasMarkdown(): string {
  return [
    advertiserSchemaMarkdown(),
    campaignSchemaMarkdown(),
    adGroupSchemaMarkdown(),
    adSchemaMarkdown(),
  ].join("\n---\n\n");
}

const ENTITY_TYPES = ["advertiser", "campaign", "adGroup", "ad"] as const;

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
  description: "Combined field reference for all TTD entity types (advertiser, campaign, adGroup, ad)",
  mimeType: "text/markdown",
  getContent: () => {
    cachedAllSchemas ??= getAllSchemasMarkdown();
    return cachedAllSchemas;
  },
};
