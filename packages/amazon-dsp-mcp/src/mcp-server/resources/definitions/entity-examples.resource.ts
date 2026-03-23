// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Example Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type AmazonDspEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_EXAMPLE_CONTENT: Record<AmazonDspEntityType, string> = {
  order: `# Amazon DSP Order (Campaign) Examples

## Create a Brand Awareness Order
\`\`\`json
{
  "entityType": "order",
  "profileId": "1234567890",
  "data": {
    "name": "Q1 Brand Awareness Campaign",
    "advertiserId": "ADVERTISER123",
    "budget": 50000.00,
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-03-31T23:59:59Z",
    "state": "ENABLED"
  }
}
\`\`\`

## Update Order Budget
\`\`\`json
{
  "entityType": "order",
  "profileId": "1234567890",
  "entityId": "ORDER123",
  "data": {
    "budget": 75000.00
  }
}
\`\`\`

## Archive an Order (no DELETE endpoint)
\`\`\`json
{
  "entityType": "order",
  "profileId": "1234567890",
  "entityId": "ORDER123",
  "data": {
    "state": "ARCHIVED"
  }
}
\`\`\`
`,

  lineItem: `# Amazon DSP Line Item (Ad Group) Examples

## Create a Prospecting Line Item with Auto Bidding
\`\`\`json
{
  "entityType": "lineItem",
  "profileId": "1234567890",
  "data": {
    "name": "Prospecting - Desktop Display",
    "orderId": "ORDER123",
    "budget": { "budgetType": "DAILY", "budget": 10000.00 },
    "state": "ENABLED",
    "bidding": {
      "bidOptimization": "AUTO"
    },
    "targetingCriteria": {
      "audience": { "include": [{ "type": "BEHAVIORAL", "value": ["in-market-auto"] }] }
    }
  }
}
\`\`\`

## Create a Remarketing Line Item with Manual Bid
\`\`\`json
{
  "entityType": "lineItem",
  "profileId": "1234567890",
  "data": {
    "name": "Remarketing - Website Visitors",
    "orderId": "ORDER123",
    "budget": { "budgetType": "DAILY", "budget": 5000.00 },
    "state": "ENABLED",
    "bidding": {
      "bidOptimization": "MANUAL",
      "bidAmount": 3.50
    },
    "targetingCriteria": {
      "audience": { "include": [{ "type": "REMARKETING", "value": ["site-visitors"] }] }
    }
  }
}
\`\`\`
`,

  creative: `# Amazon DSP Creative Examples

## Create a Display Creative
\`\`\`json
{
  "entityType": "creative",
  "profileId": "1234567890",
  "data": {
    "name": "300x250 Banner - Brand",
    "advertiserId": "ADVERTISER123",
    "clickThroughUrl": "https://example.com/landing",
    "creativeType": "STANDARD_DISPLAY",
    "state": "ACTIVE"
  }
}
\`\`\`

## Create a Video Creative
\`\`\`json
{
  "entityType": "creative",
  "profileId": "1234567890",
  "data": {
    "name": "15s Brand Video",
    "advertiserId": "ADVERTISER123",
    "clickThroughUrl": "https://example.com/landing",
    "creativeType": "VIDEO",
    "state": "ACTIVE"
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
  name: `Amazon DSP ${entityType} Examples`,
  description: `Example payloads for creating and updating Amazon DSP ${entityType} entities`,
  mimeType: "text/markdown",
  getContent: () => ENTITY_EXAMPLE_CONTENT[entityType] ?? `# Amazon DSP ${entityType} Examples\n\nNo examples available.\n`,
}));

export const entityExampleAllResource: Resource = {
  uri: "entity-examples://amazonDsp/all",
  name: "Amazon DSP All Entity Examples",
  description: "Combined example payloads for all Amazon DSP entity types",
  mimeType: "text/markdown",
  getContent: buildAllExamplesMarkdown,
};