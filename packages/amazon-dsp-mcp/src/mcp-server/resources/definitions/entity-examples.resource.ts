/**
 * AmazonDsp Entity Example Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type AmazonDspEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLE_CONTENT: Record<AmazonDspEntityType, string> = {
  campaign: `# AmazonDsp Campaign Examples

## Create a Traffic Campaign (daily budget)
\`\`\`json
{
  "entityType": "campaign",
  "profileId": "1234567890",
  "data": {
    "campaign_name": "Summer Sale 2026 - Traffic",
    "objective_type": "TRAFFIC",
    "budget_mode": "BUDGET_MODE_DAY",
    "budget": 100
  }
}
\`\`\`

## Create an App Install Campaign (lifetime budget)
\`\`\`json
{
  "entityType": "campaign",
  "profileId": "1234567890",
  "data": {
    "campaign_name": "App Install Q1 2026",
    "objective_type": "APP_INSTALLS",
    "budget_mode": "BUDGET_MODE_TOTAL",
    "budget": 5000
  }
}
\`\`\`

## Update Campaign Budget
\`\`\`json
{
  "entityType": "campaign",
  "profileId": "1234567890",
  "entityId": "1800123456789",
  "data": {
    "budget": 200
  }
}
\`\`\`
`,

  adGroup: `# AmazonDsp Ad Group Examples

## Create an Ad Group with Interest Targeting
\`\`\`json
{
  "entityType": "adGroup",
  "profileId": "1234567890",
  "data": {
    "campaign_id": "1800123456789",
    "adgroup_name": "US Gaming 18-34",
    "placement_type": "PLACEMENT_TYPE_NORMAL",
    "budget_mode": "BUDGET_MODE_DAY",
    "budget": 50,
    "schedule_type": "SCHEDULE_START_END",
    "schedule_start_time": "2026-03-01 00:00:00",
    "schedule_end_time": "2026-03-31 23:59:59",
    "optimize_goal": "CLICK",
    "bid_type": "BID_TYPE_CUSTOM",
    "bid_price": 0.5,
    "age": ["AGE_18_24", "AGE_25_34"],
    "gender": ["GENDER_UNLIMITED"],
    "location_ids": ["US"],
    "interest_category_ids": ["123456789"]
  }
}
\`\`\`

## Create an Always-On Ad Group (no schedule end)
\`\`\`json
{
  "entityType": "adGroup",
  "profileId": "1234567890",
  "data": {
    "campaign_id": "1800123456789",
    "adgroup_name": "Retargeting - Website Visitors",
    "placement_type": "PLACEMENT_TYPE_NORMAL",
    "budget_mode": "BUDGET_MODE_DAY",
    "budget": 30,
    "schedule_type": "SCHEDULE_ALWAYS",
    "optimize_goal": "CONVERT"
  }
}
\`\`\`
`,

  ad: `# AmazonDsp Ad Examples

## Create a Single Video Ad
\`\`\`json
{
  "entityType": "ad",
  "profileId": "1234567890",
  "data": {
    "adgroup_id": "1700123456789",
    "ad_name": "Summer Sale Video Ad",
    "creative_type": "SINGLE_VIDEO",
    "video_id": "v0200fg10000cekdqpbc77ue1tvq1ns0",
    "ad_text": "Shop our Summer Sale — up to 50% off!",
    "call_to_action": "SHOP_NOW",
    "landing_page_url": "https://example.com/summer-sale"
  }
}
\`\`\`

## Create a Single Image Ad
\`\`\`json
{
  "entityType": "ad",
  "profileId": "1234567890",
  "data": {
    "adgroup_id": "1700123456789",
    "ad_name": "Product Banner Ad",
    "creative_type": "SINGLE_IMAGE",
    "image_ids": ["imt0000100000011abc123"],
    "ad_text": "Discover our new collection",
    "call_to_action": "LEARN_MORE",
    "landing_page_url": "https://example.com/new-arrivals"
  }
}
\`\`\`
`,

  creative: `# AmazonDsp Creative Examples

## Create a Video Creative
\`\`\`json
{
  "entityType": "creative",
  "profileId": "1234567890",
  "data": {
    "display_name": "Summer Sale Video Creative",
    "video_id": "v0200fg10000cekdqpbc77ue1tvq1ns0",
    "ad_text": "Shop the Summer Sale — 50% off!",
    "call_to_action": "SHOP_NOW",
    "landing_page_url": "https://example.com/sale"
  }
}
\`\`\`

## Create an Image Creative
\`\`\`json
{
  "entityType": "creative",
  "profileId": "1234567890",
  "data": {
    "display_name": "Product Banner Creative",
    "image_ids": ["imt0000100000011abc123"],
    "ad_text": "New arrivals every week",
    "call_to_action": "LEARN_MORE"
  }
}
\`\`\`
`,
};

function buildAllExamplesMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_EXAMPLE_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entityExampleResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-examples://amazonDsp/${entityType}`,
  name: `AmazonDsp ${entityType} Examples`,
  description: `Example payloads for creating and updating AmazonDsp ${entityType} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_EXAMPLE_CONTENT[entityType] ?? `# AmazonDsp ${entityType} Examples\n\nNo examples available.\n`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://amazonDsp/all",
  name: "AmazonDsp All Entity Examples",
  description: "Combined example payloads for all AmazonDsp Ads entity types",
  mimeType: "text/markdown",
  getContent: buildAllExamplesMarkdown,
};
