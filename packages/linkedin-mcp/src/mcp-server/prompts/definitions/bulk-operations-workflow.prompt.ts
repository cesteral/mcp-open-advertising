// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const linkedInBulkOperationsWorkflowPrompt: Prompt = {
  name: "linkedin_bulk_operations_workflow",
  description:
    "Guide for performing bulk create, update, and status operations on LinkedIn Ads entities",
  arguments: [
    {
      name: "adAccountUrn",
      description: "LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123456789)",
      required: true,
    },
    {
      name: "operation",
      description: "Operation type: create, update, or status (default: update)",
      required: false,
    },
  ],
};

export function getLinkedInBulkOperationsWorkflowMessage(args?: Record<string, string>): string {
  const adAccountUrn = args?.adAccountUrn || "{adAccountUrn}";
  const operation = args?.operation ?? "update";

  return `# LinkedIn Bulk Operations Workflow

## Ad Account: \`${adAccountUrn}\`

## Overview

| Tool | Max Items | Description |
|------|-----------|-------------|
| \`linkedin_bulk_create_entities\` | 50 | Create multiple entities at once |
| \`linkedin_bulk_update_entities\` | 50 | Update multiple entities with custom data |
| \`linkedin_bulk_update_status\` | 50 | Change status for multiple entities |
| \`linkedin_adjust_bids\` | 50 | Batch adjust campaign bid amounts |

---
${
  operation === "create"
    ? `
## Bulk Create Workflow

### Step 1: Validate a single entity first
\`\`\`json
linkedin_validate_entity({
  "entityType": "campaign",
  "mode": "create",
  "data": {
    "name": "Campaign Template",
    "campaignGroup": "urn:li:sponsoredCampaignGroup:987654321",
    "account": "${adAccountUrn}",
    "type": "SPONSORED_UPDATES",
    "objectiveType": "BRAND_AWARENESS",
    "status": "DRAFT"
  }
})
\`\`\`

### Step 2: Create multiple campaigns
\`\`\`json
linkedin_bulk_create_entities({
  "entityType": "campaign",
  "items": [
    {
      "name": "Campaign A - US Market",
      "campaignGroup": "urn:li:sponsoredCampaignGroup:987654321",
      "account": "${adAccountUrn}",
      "type": "SPONSORED_UPDATES",
      "objectiveType": "BRAND_AWARENESS",
      "status": "DRAFT",
      "dailyBudget": { "amount": "100.00", "currencyCode": "USD" }
    },
    {
      "name": "Campaign B - UK Market",
      "campaignGroup": "urn:li:sponsoredCampaignGroup:987654321",
      "account": "${adAccountUrn}",
      "type": "SPONSORED_UPDATES",
      "objectiveType": "WEBSITE_TRAFFIC",
      "status": "DRAFT",
      "dailyBudget": { "amount": "75.00", "currencyCode": "GBP" }
    }
  ]
})
\`\`\`

### Step 3: Verify created entities
\`\`\`json
linkedin_list_entities({
  "entityType": "campaign",
  "adAccountUrn": "${adAccountUrn}",
  "count": 50
})
\`\`\`
`
    : `
## Bulk Update Workflow

### Step 1: List entities to update
\`\`\`json
linkedin_list_entities({
  "entityType": "campaign",
  "adAccountUrn": "${adAccountUrn}",
  "count": 50
})
\`\`\`

### Step 2: Bulk update budgets
\`\`\`json
linkedin_bulk_update_entities({
  "entityType": "campaign",
  "items": [
    {
      "entityUrn": "urn:li:sponsoredCampaign:111111111",
      "data": { "dailyBudget": { "amount": "150.00", "currencyCode": "USD" } }
    },
    {
      "entityUrn": "urn:li:sponsoredCampaign:222222222",
      "data": { "dailyBudget": { "amount": "200.00", "currencyCode": "USD" } }
    }
  ]
})
\`\`\`

### Step 3: Bulk pause campaigns
\`\`\`json
linkedin_bulk_update_status({
  "entityType": "campaign",
  "entityUrns": [
    "urn:li:sponsoredCampaign:111111111",
    "urn:li:sponsoredCampaign:222222222"
  ],
  "status": "PAUSED"
})
\`\`\`
`
}

## Bulk Bid Adjustment

\`\`\`json
linkedin_adjust_bids({
  "adjustments": [
    {
      "campaignUrn": "urn:li:sponsoredCampaign:111111111",
      "amount": "15.00",
      "currencyCode": "USD"
    },
    {
      "campaignUrn": "urn:li:sponsoredCampaign:222222222",
      "amount": "10.00",
      "currencyCode": "USD"
    }
  ],
  "reason": "Optimize bids based on performance analysis"
})
\`\`\`

## Error Handling

Bulk operations use partial success — always check the results array:

\`\`\`
{
  "results": [
    { "entityUrn": "urn:li:...:111", "success": true },
    { "entityUrn": "urn:li:...:222", "success": false, "error": "Entity not found" }
  ],
  "successCount": 1,
  "failureCount": 1
}
\`\`\`

For failed items, you can retry individually using the single-entity tools.

## Rate Limits

- Read operations: 1 token per request
- Write operations: 3 tokens per request
- Rate limit: 100 requests/minute per API key
- Bulk operations use concurrency of 5 to stay within limits
`;
}
