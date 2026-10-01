// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Example Resources (Unified API, #234)
 *
 * Payload shapes follow the DSP migration guide's "UNIFIED" before/after
 * examples (amzn/ads-advanced-tools-docs @ e25aace0,
 * unified-campaign-management-migration-skills/skills/unified-dsp-cm-migration/SKILL.md
 * §4–§7) and the `DSP<Entity>Create` schemas in unified-api-dsp.json. The
 * server adds `adProduct: "AMAZON_DSP"`, and a default `state: "PAUSED"` on
 * orders and line items.
 */
import type { Resource } from "../types.js";
import { AMAZON_DSP_CANONICAL_ENTITY_TYPES } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

const ENTITY_EXAMPLES: Record<string, string> = {
  order: `# Amazon DSP Order (Unified campaign) Examples

## Create an Order
Sent as \`POST /adsApi/v1/create/campaigns\` with \`{ "campaigns": [ <data + adProduct + state: PAUSED> ] }\`.
\`\`\`json
{
  "entityType": "order",
  "profileId": "1234567890",
  "accountId": "5550001112223",
  "data": {
    "name": "Q3 Brand Campaign",
    "countries": ["US"],
    "flights": [
      {
        "startDateTime": "2026-07-01T00:00:00Z",
        "endDateTime": "2026-09-30T23:59:59Z",
        "budget": {
          "budgetType": "MONETARY",
          "budgetValue": { "monetaryBudgetValue": { "monetaryBudget": { "value": 50000 } } }
        }
      }
    ],
    "frequencies": [
      { "eventMaxCount": 5, "timeUnit": "DAYS", "timeCount": 1, "frequencyTargetingSetting": "IMPRESSION" }
    ],
    "optimizations": {
      "bidSettings": { "bidStrategy": "SPEND_BUDGET_IN_FULL" },
      "goalSettings": { "kpi": "CLICK_THROUGH_RATE" }
    }
  }
}
\`\`\`

## Activate the Order
Orders are created PAUSED; enable delivery once ad groups, ads and targets are in place.
\`\`\`json
{
  "entityType": "order",
  "profileId": "1234567890",
  "accountId": "5550001112223",
  "entityId": "581234567890123",
  "data": { "state": "ENABLED" }
}
\`\`\`
`,
  lineItem: `# Amazon DSP Line Item (Unified ad group) Examples

## Create a Line Item
Sent as \`POST /adsApi/v1/create/adGroups\`. Legacy \`orderId\` is accepted for \`campaignId\`.
\`\`\`json
{
  "entityType": "lineItem",
  "profileId": "1234567890",
  "accountId": "5550001112223",
  "data": {
    "name": "Display Retargeting",
    "campaignId": "581234567890123",
    "inventoryType": "DISPLAY",
    "advertisedProductCategoryIds": ["12345"],
    "bid": { "baseBid": 3.5 },
    "creativeRotationType": "RANDOM",
    "startDateTime": "2026-07-01T00:00:00Z",
    "endDateTime": "2026-09-30T23:59:59Z",
    "optimization": { "bidStrategy": "SPEND_BUDGET_IN_FULL" },
    "pacing": { "deliveryProfile": "EVEN" },
    "targetingSettings": {
      "amazonViewability": { "viewabilityTier": "ALL_TIERS", "includeUnmeasurableImpressions": false },
      "timeZoneType": "VIEWER",
      "userLocationSignal": "ANYWHERE"
    }
  }
}
\`\`\`

## Set a Daily Budget
\`\`\`json
{
  "entityType": "lineItem",
  "profileId": "1234567890",
  "accountId": "5550001112223",
  "entityId": "592345678901234",
  "data": {
    "budgets": [
      {
        "budgetType": "MONETARY",
        "budgetValue": { "monetaryBudgetValue": { "monetaryBudget": { "value": 2500 } } },
        "recurrenceTimePeriod": "DAILY"
      }
    ]
  }
}
\`\`\`
`,
  creative: `# Amazon DSP Creative (Unified ad) Examples

## Create a Responsive Ecommerce Ad
Sent as \`POST /adsApi/v1/create/ads\`. Link it to an ad group with a \`creativeAssociation\`.
\`\`\`json
{
  "entityType": "creative",
  "profileId": "1234567890",
  "accountId": "5550001112223",
  "data": {
    "name": "Responsive Ecommerce Ad",
    "adType": "COMPONENT",
    "state": "PAUSED",
    "creative": {
      "componentCreative": {
        "responsiveEcommerceSettings": {
          "language": "EN",
          "inventoryTypes": ["DISPLAY"],
          "products": [{ "productId": "B0EXAMPLE", "productIdType": "ASIN" }],
          "optimizationGoalKpi": "CLICK_THROUGH_RATE",
          "responsiveSizingBehavior": "ENABLED",
          "supportedThirdPartySellers": "DISABLED"
        }
      }
    }
  }
}
\`\`\`
`,
  target: `# Amazon DSP Target Examples

## Create an Audience Target
Sent as \`POST /adsApi/v1/create/targets\`. Legacy \`lineItemId\` is accepted for \`adGroupId\`.
\`\`\`json
{
  "entityType": "target",
  "profileId": "1234567890",
  "accountId": "5550001112223",
  "data": {
    "adGroupId": "592345678901234",
    "negative": false,
    "state": "ENABLED",
    "targetType": "AUDIENCE",
    "targetDetails": {
      "audienceTarget": { "audienceId": { "defaultValue": "AUD456" }, "groupId": "1" }
    }
  }
}
\`\`\`

## Remove Targets
Targets have no Unified update; delete and recreate (\`amazon_dsp_delete_entity\`, \`POST /adsApi/v1/delete/targets\`).
`,
  creativeAssociation: `# Amazon DSP Creative Association (Unified ad association) Examples

## Associate an Ad with an Ad Group
Sent as \`POST /adsApi/v1/create/adAssociations\`. Legacy \`lineItemId\` / \`creativeId\` are accepted for \`adGroupId\` / \`adId\`.
\`\`\`json
{
  "entityType": "creativeAssociation",
  "profileId": "1234567890",
  "accountId": "5550001112223",
  "data": {
    "adGroupId": "592345678901234",
    "adId": "614567890123456",
    "state": "ENABLED"
  }
}
\`\`\`
`,
};

function buildAllExamplesMarkdown(): string {
  return AMAZON_DSP_CANONICAL_ENTITY_TYPES.map((entityType) => ENTITY_EXAMPLES[entityType]).join(
    "\n\n---\n\n"
  );
}

export const entityExampleResources: Resource[] = AMAZON_DSP_CANONICAL_ENTITY_TYPES.map(
  (entityType) => ({
    uri: `entity-examples://amazonDsp/${entityType}`,
    name: `Amazon DSP ${entityType} Examples`,
    description: `Example payloads for creating and updating Amazon DSP ${entityType} entities`,
    mimeType: "text/markdown",
    getContent: () =>
      ENTITY_EXAMPLES[entityType] ??
      `# Amazon DSP ${entityType} Examples\n\nNo examples available.\n`,
  })
);

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://amazonDsp/all",
  name: "Amazon DSP All Entity Examples",
  description: "Combined example payloads for all Amazon DSP entity types",
  mimeType: "text/markdown",
  getContent: buildAllExamplesMarkdown,
};
