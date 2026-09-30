// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const msadsBulkOperationsWorkflowPrompt: Prompt = {
  name: "msads_bulk_operations_workflow",
  description: "Guide for performing bulk operations in Microsoft Advertising",
  arguments: [],
};

export function getMsAdsBulkOperationsWorkflowMessage(): string {
  return `# Microsoft Ads Bulk Operations Workflow

## Bulk Create Entities
\`\`\`json
msads_bulk_create_entities({
  "entityType": "keyword",
  "adGroupId": "123",
  "items": [
    { "Text": "keyword 1", "MatchType": "Phrase", "Bid": { "Amount": 1.50 } },
    { "Text": "keyword 2", "MatchType": "Exact", "Bid": { "Amount": 2.00 } }
  ]
})
\`\`\`
Every item in one call belongs to one parent, passed as \`accountId\` (campaign, adExtension),
\`campaignId\` (adGroup) or \`adGroupId\` (ad, keyword) and sent as the request-body parent element.

## Bulk Update Status (Pause/Activate)
\`\`\`json
msads_bulk_update_status({
  "entityType": "campaign",
  "accountId": "789012",
  "entityIds": ["111", "222", "333"],
  "status": "Paused"
})
\`\`\`

## Bulk Bid Adjustments
\`\`\`json
msads_adjust_bids({
  "entityType": "keyword",
  "scope": { "adGroupId": "123" },
  "adjustments": [
    { "entityId": "111", "bidField": "Bid", "newBid": 1.75 },
    { "entityId": "222", "bidField": "Bid", "newBid": 2.25 }
  ]
})
\`\`\`
The adjust-bids tool reads the entities first, then sends a minimal Update with each bid as a
Bid object (\`{ "Amount": newBid }\`), so no other field is touched.

## Batch Limits
| Entity | Batch Limit |
|--------|-------------|
| Campaign | 100 |
| Ad Group | 1,000 |
| Ad | 50 |
| Keyword | 1,000 |
| Budget | 100 |
| Ad Extension | 100 |
| Audience | 100 |
| Label | 100 |
`;
}
