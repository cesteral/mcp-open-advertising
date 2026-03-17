// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Schema Resources
 */
import type { Resource } from "../types.js";
import { getSupportedEntityTypes, type AmazonDspEntityType } from "../../tools/utils/entity-mapping.js";

const ENTITY_SCHEMA_CONTENT: Record<AmazonDspEntityType, string> = {
  order: `# Amazon DSP Order (Campaign) Schema

\`\`\`json
{
  "required": ["name", "advertiserId", "budget", "startDate", "endDate"],
  "properties": {
    "name": { "type": "string" },
    "advertiserId": { "type": "string" },
    "budget": { "type": "number", "description": "Total budget in USD dollars" },
    "startDate": { "type": "string", "format": "date-time", "description": "ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ" },
    "endDate": { "type": "string", "format": "date-time" },
    "state": { "type": "string", "enum": ["RUNNING", "PAUSED", "ARCHIVED"] }
  }
}
\`\`\`

## Notes
- Budget is in USD dollars (e.g., 50000.00 = $50,000)
- Dates must use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ
- Amazon DSP has no DELETE endpoint — use state: "ARCHIVED" to remove
- Active state is "RUNNING" (not "DELIVERING")

## Read-Only Fields
orderId, creationDate, lastUpdatedDate
`,

  lineItem: `# Amazon DSP Line Item (Ad Group) Schema

\`\`\`json
{
  "required": ["name", "orderId", "budget"],
  "properties": {
    "name": { "type": "string" },
    "orderId": { "type": "string" },
    "budget": {
      "type": "object",
      "description": "Budget configuration",
      "properties": {
        "budgetType": { "type": "string", "enum": ["DAILY", "LIFETIME"] },
        "budget": { "type": "number", "description": "Budget amount in USD dollars" }
      },
      "required": ["budgetType", "budget"]
    },
    "state": { "type": "string", "enum": ["RUNNING", "PAUSED", "ARCHIVED"] },
    "bidding": {
      "type": "object",
      "properties": {
        "bidOptimization": {
          "type": "object",
          "properties": {
            "bidAmount": { "type": "number", "description": "Bid amount in USD" }
          }
        }
      }
    },
    "targetingCriteria": { "type": "object", "description": "Targeting configuration" }
  }
}
\`\`\`

## Notes
- orderId links this line item to its parent Order
- bidding.bidOptimization: AUTO lets Amazon optimize bids automatically
- targetingCriteria supports audience, contextual, geographic, and device targeting

## Read-Only Fields
lineItemId, orderId (inherited), creationDate, lastUpdatedDate
`,

  creative: `# Amazon DSP Creative Schema

\`\`\`json
{
  "required": ["name", "advertiserId", "clickThroughUrl", "creativeType"],
  "properties": {
    "name": { "type": "string" },
    "advertiserId": { "type": "string" },
    "clickThroughUrl": { "type": "string", "format": "uri" },
    "creativeType": { "type": "string", "enum": ["STANDARD_DISPLAY", "VIDEO", "RICH_MEDIA"] },
    "state": { "type": "string", "enum": ["ACTIVE", "INACTIVE", "ARCHIVED"] }
  }
}
\`\`\`

## Notes
- creativeType: STANDARD_DISPLAY for banner ads, VIDEO for video ads, RICH_MEDIA for interactive ads
- clickThroughUrl is the landing page destination
- Creatives are linked to line items separately after creation

## Read-Only Fields
creativeId, creationDate, lastUpdatedDate
`,
};

function buildEntitySchemaMarkdown(entityType: AmazonDspEntityType): string {
  return ENTITY_SCHEMA_CONTENT[entityType] ?? `# Amazon DSP ${entityType}\n\nNo schema information available.\n`;
}

function buildAllSchemasMarkdown(): string {
  return getSupportedEntityTypes()
    .map((t) => ENTITY_SCHEMA_CONTENT[t])
    .join("\n\n---\n\n");
}

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map((entityType) => ({
  uri: `entity-schema://amazonDsp/${entityType}`,
  name: `Amazon DSP ${entityType} Schema`,
  description: `Field reference for Amazon DSP ${entityType} entity including required fields, optional fields, and read-only fields`,
  mimeType: "text/markdown",
  getContent: () => buildEntitySchemaMarkdown(entityType),
}));

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://amazonDsp/all",
  name: "Amazon DSP All Entity Schemas",
  description: "Combined field reference for all Amazon DSP entity types",
  mimeType: "text/markdown",
  getContent: buildAllSchemasMarkdown,
};