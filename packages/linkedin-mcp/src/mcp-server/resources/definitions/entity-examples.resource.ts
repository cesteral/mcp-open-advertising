/**
 * LinkedIn Entity Example Resources
 * Curated example payloads for common patterns
 */
import type { Resource } from "../types.js";

const ENTITY_EXAMPLES: Record<string, string> = {
  campaignGroup: `# LinkedIn Campaign Group Examples

## Create a Campaign Group

\`\`\`json
{
  "entityType": "campaignGroup",
  "data": {
    "name": "Q1 2026 Brand Awareness",
    "account": "urn:li:sponsoredAccount:123456789",
    "status": "DRAFT",
    "totalBudget": { "amount": "5000.00", "currencyCode": "USD" },
    "runSchedule": {
      "start": 1735689600000,
      "end": 1748476800000
    }
  }
}
\`\`\`

## Pause a Campaign Group

\`\`\`json
{
  "entityType": "campaignGroup",
  "entityUrn": "urn:li:sponsoredCampaignGroup:987654321",
  "data": { "status": "PAUSED" }
}
\`\`\`
`,

  campaign: `# LinkedIn Campaign Examples

## Create a Sponsored Content Campaign

\`\`\`json
{
  "entityType": "campaign",
  "data": {
    "name": "LinkedIn Tech Leaders Campaign",
    "campaignGroup": "urn:li:sponsoredCampaignGroup:987654321",
    "account": "urn:li:sponsoredAccount:123456789",
    "type": "SPONSORED_UPDATES",
    "objectiveType": "BRAND_AWARENESS",
    "status": "DRAFT",
    "dailyBudget": { "amount": "100.00", "currencyCode": "USD" },
    "bidType": "CPM",
    "unitCost": { "amount": "12.00", "currencyCode": "USD" },
    "runSchedule": {
      "start": 1735689600000,
      "end": 1748476800000
    },
    "targetingCriteria": {
      "include": {
        "and": [
          {
            "or": {
              "urn:li:adTargetingFacet:geos": [
                "urn:li:geo:103644278"
              ]
            }
          },
          {
            "or": {
              "urn:li:adTargetingFacet:memberSeniorities": [
                "urn:li:adSeniority:5",
                "urn:li:adSeniority:6"
              ]
            }
          }
        ]
      }
    },
    "locale": {
      "country": "US",
      "language": "en"
    }
  }
}
\`\`\`

## Create a Lead Gen Campaign

\`\`\`json
{
  "entityType": "campaign",
  "data": {
    "name": "Lead Generation - IT Decision Makers",
    "campaignGroup": "urn:li:sponsoredCampaignGroup:987654321",
    "account": "urn:li:sponsoredAccount:123456789",
    "type": "SPONSORED_UPDATES",
    "objectiveType": "LEAD_GENERATION",
    "status": "DRAFT",
    "dailyBudget": { "amount": "200.00", "currencyCode": "USD" },
    "bidType": "CPC",
    "unitCost": { "amount": "8.00", "currencyCode": "USD" }
  }
}
\`\`\`
`,

  creative: `# LinkedIn Creative Examples

## Create a Sponsored Content Creative

\`\`\`json
{
  "entityType": "creative",
  "data": {
    "campaign": "urn:li:sponsoredCampaign:111222333",
    "status": "DRAFT",
    "reference": "urn:li:ugcPost:123456789",
    "type": "SPONSORED_STATUS_UPDATE"
  }
}
\`\`\`
`,

  conversionRule: `# LinkedIn Conversion Rule Examples

## Create a Purchase Conversion Rule

\`\`\`json
{
  "entityType": "conversionRule",
  "data": {
    "name": "Product Purchase",
    "type": "PURCHASE",
    "account": "urn:li:sponsoredAccount:123456789",
    "status": "ACTIVE",
    "urlRules": [
      {
        "expression": "https://example.com/thank-you",
        "matchType": "EXACT_URL"
      }
    ],
    "value": { "amount": "100.00", "currencyCode": "USD" },
    "attributionWindow": {
      "clickAttribution": "30_DAY",
      "viewAttribution": "7_DAY"
    }
  }
}
\`\`\`
`,
};

function buildExampleResource(entityType: string): Resource {
  return {
    uri: `entity-examples://linkedin/${entityType}`,
    name: `LinkedIn ${entityType} Examples`,
    description: `Example payloads for creating and updating LinkedIn ${entityType} entities`,
    mimeType: "text/markdown",
    getContent: () => ENTITY_EXAMPLES[entityType] ?? `# ${entityType} Examples\n\nNo examples available.`,
  };
}

export const entityExampleResources: Resource[] = Object.keys(ENTITY_EXAMPLES).map(
  buildExampleResource
);

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://linkedin/all",
  name: "LinkedIn All Entity Examples",
  description: "Example payloads for all LinkedIn Ads entity types",
  mimeType: "text/markdown",
  getContent: () =>
    Object.entries(ENTITY_EXAMPLES)
      .map(([, content]) => content)
      .join("\n\n---\n\n"),
};
