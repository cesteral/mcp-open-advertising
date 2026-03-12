import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type CM360EntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLES: Record<CM360EntityType, string> = {
  campaign: `# Campaign Examples

## Create a display campaign
\`\`\`json
{
  "name": "Summer Sale 2026",
  "advertiserId": "ADVERTISER_ID",
  "startDate": "2026-04-01",
  "endDate": "2026-06-30"
}
\`\`\``,

  placement: `# Placement Examples

## Create a standard display placement
\`\`\`json
{
  "name": "Homepage Banner 300x250",
  "campaignId": "CAMPAIGN_ID",
  "siteId": "SITE_ID",
  "compatibility": "DISPLAY",
  "size": { "width": 300, "height": 250 },
  "paymentSource": "PLACEMENT_AGENCY_PAID",
  "tagFormats": ["PLACEMENT_TAG_STANDARD"]
}
\`\`\`

## Create a video placement
\`\`\`json
{
  "name": "Pre-roll Video",
  "campaignId": "CAMPAIGN_ID",
  "siteId": "SITE_ID",
  "compatibility": "IN_STREAM_VIDEO",
  "size": { "width": 0, "height": 0 }
}
\`\`\``,

  ad: `# Ad Examples

## Create a standard ad linking creative to placement
\`\`\`json
{
  "name": "Summer Sale - Banner Ad",
  "campaignId": "CAMPAIGN_ID",
  "type": "AD_SERVING_STANDARD_AD",
  "placementAssignments": [{ "placementId": "PLACEMENT_ID", "active": true }],
  "creativeAssignments": [{ "creativeId": "CREATIVE_ID", "active": true }],
  "active": true
}
\`\`\``,

  creative: `# Creative Examples

## Create a display creative
\`\`\`json
{
  "name": "Summer Sale Banner",
  "advertiserId": "ADVERTISER_ID",
  "type": "DISPLAY",
  "size": { "width": 300, "height": 250 },
  "active": true
}
\`\`\``,

  site: `# Site Examples

## Create a site
\`\`\`json
{
  "name": "example.com",
  "approved": true
}
\`\`\``,

  advertiser: `# Advertiser Examples

## Get advertiser details
Advertisers are typically pre-existing. Use \`cm360_get_entity\` to retrieve:
\`\`\`json
{
  "tool": "cm360_get_entity",
  "params": {
    "profileId": "PROFILE_ID",
    "entityType": "advertiser",
    "entityId": "ADVERTISER_ID"
  }
}
\`\`\``,

  floodlightActivity: `# Floodlight Activity Examples

## Create a purchase tracking activity
\`\`\`json
{
  "name": "Purchase Confirmation",
  "floodlightConfigurationId": "FLOODLIGHT_CONFIG_ID",
  "floodlightActivityGroupName": "conversions",
  "floodlightTagType": "GLOBAL_SITE_TAG",
  "countingMethod": "STANDARD_COUNTING",
  "expectedUrl": "https://example.com/thank-you"
}
\`\`\`

## Create a lead form activity
\`\`\`json
{
  "name": "Lead Form Submission",
  "floodlightConfigurationId": "FLOODLIGHT_CONFIG_ID",
  "floodlightActivityGroupName": "leads",
  "floodlightTagType": "GLOBAL_SITE_TAG",
  "countingMethod": "UNIQUE_COUNTING"
}
\`\`\``,

  floodlightConfiguration: `# Floodlight Configuration Examples

## Update lookback windows
\`\`\`json
{
  "lookbackConfiguration": {
    "clickDuration": 30,
    "postImpressionActivitiesDuration": 7
  }
}
\`\`\`
Note: Floodlight configurations cannot be created — one exists per advertiser.`,
};

export const entityExampleResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-examples://${entityType}`,
  name: `${entityType} Examples`,
  description: `Example payloads for CM360 ${entityType} operations`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_EXAMPLES[entityType] || `# ${entityType}\n\nNo examples yet.`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://all",
  name: "All CM360 Entity Examples",
  description: "Combined examples for all CM360 entity types",
  mimeType: "text/markdown",
  getContent: () => getSupportedEntityTypes()
    .map((t) => ENTITY_EXAMPLES[t])
    .join("\n\n---\n\n"),
};
