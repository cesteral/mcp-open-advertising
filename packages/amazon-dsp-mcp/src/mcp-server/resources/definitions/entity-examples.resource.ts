// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Example Resources
 */
import type { Resource } from "../types.js";
import { AMAZON_DSP_CANONICAL_ENTITY_TYPES } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

const ENTITY_EXAMPLES: Record<string, string> = {
  order: `# Amazon DSP Campaign / Order Examples

## Create a Campaign
\`\`\`json
{
  "entityType": "campaign",
  "profileId": "1234567890",
  "data": {
    "name": "Q3 Brand Campaign",
    "advertiserId": "ADV123",
    "startDateTime": "2026-07-01T00:00:00Z",
    "endDateTime": "2026-09-30T23:59:59Z",
    "state": "PAUSED"
  }
}
\`\`\`

## Enable Performance+ Automation On The Order Object
\`\`\`json
{
  "entityType": "order",
  "profileId": "1234567890",
  "entityId": "ord_123",
  "data": {
    "automatedAdGroupCreation": {
      "enabled": true
    }
  }
}
\`\`\`
`,
  lineItem: `# Amazon DSP Ad Group / Line Item Examples

## Create an Ad Group
\`\`\`json
{
  "entityType": "adGroup",
  "profileId": "1234567890",
  "data": {
    "name": "Display Retargeting",
    "orderId": "ord_123",
    "advertiserId": "ADV123",
    "budget": { "budgetType": "DAILY", "budget": 2500 },
    "bidding": {
      "bidOptimization": "MANUAL",
      "bidAmount": 1.75
    },
    "state": "PAUSED"
  }
}
\`\`\`
`,
  creative: `# Amazon DSP Creative Examples

## Create a Creative Asset
\`\`\`json
{
  "entityType": "creative",
  "profileId": "1234567890",
  "data": {
    "name": "300x250 Banner",
    "advertiserId": "ADV123",
    "creativeType": "STANDARD_DISPLAY",
    "clickThroughUrl": "https://example.com/landing"
  }
}
\`\`\`
`,
  target: `# Amazon DSP Target Examples

## Create a Target
\`\`\`json
{
  "entityType": "target",
  "profileId": "1234567890",
  "data": {
    "lineItemId": "li_123",
    "expressionType": "AUDIENCE",
    "expression": {
      "audienceIds": ["aud_1", "aud_2"]
    }
  }
}
\`\`\`
`,
  creativeAssociation: `# Amazon DSP Creative Association Examples

## Associate a Creative to an Ad Group
\`\`\`json
{
  "entityType": "creativeAssociation",
  "profileId": "1234567890",
  "data": {
    "lineItemId": "li_123",
    "creativeId": "cr_456"
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
